import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { needsNativeRendering } from './render-policy'

const isOn = atom({ plugin: 'for-your-eyes', key: 'isOn' } as const, true)
const currentTurn = atom({ plugin: 'for-your-eyes', key: 'currentTurn' } as const, '')
const textTurn = atom({ plugin: 'for-your-eyes', key: 'textTurn' } as const, '')
const answerTurn = atom({ plugin: 'for-your-eyes', key: 'answerTurn' } as const, null)

const COMMAND = 'for-your-eyes'
// The manifest's version, recorded with each load.
const VERSION = '0.4.1'

// Theme keys keep the outline readable in light and dark modes.
// Desktop uses an unfilled outline: a background on the shadow-tree wrapper
// can cover native selection paint. The terminal can retain its tint.
const ANSWER_BACKGROUND = 'memoryBackgroundColor'
const ANSWER_BORDER = 'claude'

type Block = { type: string; [field: string]: unknown }

// Every finished turn's answer, from the transcript's index (hooks/index.py), read when the mod loads.
const indexedAnswers = new Set<string>()
const textRowsOfMessage = new Map<string, string[]>()

// The desktop app names a text block `<API message id>-t<n>`; the transcript says which row that is.
const DESKTOP_ID = /^(msg_[A-Za-z0-9_-]+)-t(\d+)$/
const rowOfItem = new Map<string, string>()
// This load's text rows by their text: the desktop app draws a row before the transcript file holds it.
const rowOfText = new Map<string, string>()

// Keep word boundaries and compare the actual text: removing all whitespace (or
// using a short hash) can make different responses look like the same answer.
function textKey(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}
// Desktop items the transcript did not hold yet (still streaming), by when they were last looked up.
const missedAt = new Map<string, number>()
let transcriptPath = ''
let generation = 0

function resetIndex() {
  generation++
  indexedAnswers.clear()
  textRowsOfMessage.clear()
  rowOfItem.clear()
  rowOfText.clear()
  missedAt.clear()
  transcriptPath = ''
}

const textOf = (content: readonly Block[]) =>
  content
    .filter(block => block.type === 'text')
    .map(block => String(block.text ?? ''))
    .join('\n')

// The session's transcript file: the projects folder's entry for the folder the session
// started in, named by the session's id. A new chat's file is written with its first prompt,
// so the path is worked out from those, not looked for.
async function transcriptOf($: EngineInterface) {
  try {
    const id = await $.session.id()
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const slug = (await $.session.root()).replace(/[^A-Za-z0-9]/g, '-')
    return `${config}/projects/${slug}/${id}.jsonl`
  } catch {
    // No session to name: earlier turns' answers then show as they are.
    return ''
  }
}

// Index the transcript's turns, so a resumed chat's earlier answers stand out too.
async function loadIndex($: EngineInterface) {
  const loadingGeneration = generation
  if (transcriptPath === '' || !(await $.fs.exists(transcriptPath))) return 0
  const script = `${$.plugin.root}/hooks/index.py`
  for (const python of ['python3', '/usr/bin/python3']) {
    try {
      const { exitCode, stdout } = await $.process.run([python, '-I', script, transcriptPath], { timeoutMs: 20_000 })
      if (exitCode !== 0) continue
      const index = JSON.parse(stdout) as { turns: { final: string | null }[]; msgs: Record<string, string[]> }
      if (loadingGeneration !== generation) return 0
      for (const one of index.turns) if (one.final !== null) indexedAnswers.add(one.final)
      for (const [message, rows] of Object.entries(index.msgs)) textRowsOfMessage.set(message, rows)
      return index.turns.length
    } catch {
      // This python is missing or failed: try the next.
    }
  }
  return 0
}

// The text row a drawing is of: the terminal names it; the desktop app names its API message.
async function rowOf($: EngineInterface, itemId: string, text: string) {
  const match = DESKTOP_ID.exec(itemId)
  if (match === null) return itemId
  const [, messageId = '', index = '0'] = match
  const known = rowOfItem.get(itemId) ?? textRowsOfMessage.get(messageId)?.[Number(index)]
  if (known !== undefined) return known
  if (transcriptPath === '') transcriptPath = await transcriptOf($)
  if (transcriptPath === '') return undefined
  const now = await $.clock.now()
  if (now - (missedAt.get(itemId) ?? -Infinity) < 2000) return rowOfText.get(textKey(text)) || undefined

  // A row of the running turn, not in the index: find it in the transcript.
  const found = await $.process
    .run(['python3', '-I', `${$.plugin.root}/hooks/index.py`, transcriptPath, '--message', messageId], { timeoutMs: 2000 })
    .catch(() => ({ stdout: '' }))
  let rows: string[] = []
  try { rows = JSON.parse(found.stdout) as string[] } catch { /* File may still be arriving. */ }
  const row = rows[Number(index)]
  if (row === undefined) {
    missedAt.set(itemId, now)
    // Only use text while the transcript is behind, and never cache that guess.
    // Repeated text is marked ambiguous when appended below.
    return rowOfText.get(textKey(text)) || undefined
  }
  rowOfItem.set(itemId, row)
  missedAt.delete(itemId)
  return row
}

// Whether a text row is its turn's answer: the live turn's last text once it ended, or the index's.
async function isAnswer($: EngineInterface, row: string) {
  const liveTurn = await read($, memberOf(textTurn, { requestId: row }))
  if (liveTurn !== '') {
    const record = await read($, memberOf(answerTurn, { requestId: liveTurn }))
    if (record !== null) return !record.isRunning && record.finalId === row
  }
  return indexedAnswers.has(row)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    resetIndex()
    await $.command.register({
      name: COMMAND,
      description: 'Highlight final answers where native interactions can be preserved (run again to turn it off)',
      immediate: true,
    })

    const stored = await $.store.get('isOn')
    if (typeof stored === 'boolean') await update($, isOn, () => stored)

    await update($, currentTurn, () => '')
    transcriptPath = await transcriptOf($)
    const started = await next(e)

    // Reading the earlier turns can take a moment on a long chat: it runs after the session is up.
    void (async () => {
      const turns = await loadIndex($)
      if (turns > 0) $.ui.invalidate('ui.render')
      // Which chat loaded which version, one key each so chats loading together keep their own;
      // the newest 20, what a "did it load?" question is answered from.
      await $.store.set(`load:${transcriptPath}`, { version: VERSION, at: await $.clock.now(), turns })
      const loads = (await $.store.keys()).filter(key => key.startsWith('load:'))
      for (const key of [...loads.slice(0, -20), 'loads', 'loaded', 'seen']) await $.store.delete(key)
    })().catch(() => undefined)

    return started
  })

  on('classic.UserPromptSubmit', ($, e, next) => {
    if (e.transcript_path) transcriptPath = e.transcript_path

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const now = await update($, isOn, was => !was)
    await $.store.set('isOn', now)

    return {
      text: now
        ? 'Final-answer highlight is on. Remote answers with links or code keep their native rendering.'
        : 'Final-answer highlight is off: final answers are drawn like every other message.',
    }
  })

  on('session.end', async ($, e, next) => {
    resetIndex()
    await update($, currentTurn, () => '')
    return next(e)
  })

  // Only main-loop turns raise turn.start.
  on('turn.start', async ($, e, next) => {
    const previous = await read($, currentTurn)
    if (previous !== '') {
      await update($, memberOf(answerTurn, { requestId: previous }), was =>
        was === null || !was.isRunning ? was : { ...was, finalId: was.texts.at(-1) ?? null, isRunning: false },
      )
    }
    await update($, memberOf(answerTurn, { requestId: e.turnId }), () => ({ texts: [], finalId: null, isRunning: true }))
    await update($, currentTurn, () => e.turnId)

    return next(e)
  })

  // Note each text row of the main loop's response before it is stored.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const hasText = e.agentId === undefined && e.message.type === 'assistant' && textOf(e.message.content).trim() !== ''
    const turnId = hasText ? await read($, currentTurn) : ''
    if (turnId === '') return next(e)

    await update($, memberOf(textTurn, { requestId: e.uuid }), () => turnId)
    const key = textKey(textOf(e.message.content))
    const previousRow = rowOfText.get(key)
    rowOfText.set(key, previousRow === undefined || previousRow === e.uuid ? e.uuid : '')
    await update($, memberOf(answerTurn, { requestId: turnId }), was => {
      if (was === null || was.texts.includes(e.uuid)) return was
      const texts = [...was.texts, e.uuid]
      // A row stored after its turn ended is the turn's last word.
      return was.isRunning ? { ...was, texts } : { ...was, texts, finalId: e.uuid }
    })

    const stored = await next(e)
    // A desktop item drawn while it streamed is in the transcript now: ask its drawing again.
    if (missedAt.size > 0) {
      missedAt.clear()
      $.ui.invalidate('ui.render')
    }

    return stored
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, memberOf(answerTurn, { requestId: e.turnId }), was =>
        was === null ? null : { ...was, finalId: was.texts.at(-1) ?? null, isRunning: false },
      )
      // The answer is known now: ask every drawing again, and once more when the transcript file
      // has caught up, so a block that could not be placed while it streamed gets its box.
      missedAt.clear()
      $.ui.invalidate('ui.render')
      const completedGeneration = generation
      $.clock.after(2000, () => {
        // Do not redraw a settled answer while the person is selecting it.
        if (completedGeneration === generation && missedAt.size > 0) {
          missedAt.clear()
          $.ui.invalidate('ui.render')
        }
      })
    }

    return next(e)
  })

  // The answer, in a box of its own; every other block as the engine draws it.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isOn)) || e.props.isSummary) return next(e)
    // Return the engine result directly, without even a fragment/Box around
    // it. Remote wrappers reparent the native response into a plugin slot.
    if (needsNativeRendering(e.surface, e.props.text)) return next(e)
    const row = await rowOf($, e.requestId, e.props.text)
    if (row === undefined || !(await isAnswer($, row))) return next(e)

    // Decorate exactly one unchanged engine response. Do not duplicate its
    // text, add a Markdown leaf, or put it under a scrolling/clipping container.
    const { Box } = $.ui.resolve(e)
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={ANSWER_BORDER}
        {...(e.surface === 'terminal' ? { backgroundColor: ANSWER_BACKGROUND } : {})}
        paddingX={1}
      >
        {await next(e)}
      </Box>
    )
  })
}
