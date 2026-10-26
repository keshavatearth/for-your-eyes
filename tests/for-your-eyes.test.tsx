import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const MODEL = { kind: 'model', model: 'claude-opus-5-5' } as const
// Room for a slow machine: each test raises a dozen events through the engine.
const SLOW = { timeoutMs: 60_000 }
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const row = ($: Engine, uuid: string, content: { type: string; [field: string]: unknown }[], agentId?: string) =>
  $.session.append({
    door: 'response',
    origin: MODEL,
    uuid,
    ...(agentId === undefined ? {} : { agentId }),
    message: { type: 'assistant', role: 'assistant', content },
  })
const say = ($: Engine, uuid: string, text: string) => row($, uuid, [{ type: 'text', text }])
const callTool = ($: Engine, uuid: string, toolUseId: string) =>
  row($, uuid, [{ type: 'tool_use', id: toolUseId, name: 'Bash', input: { command: 'ls' } }])

const runCommand = ($: Engine) =>
  $.command.run({
    command: 'for-your-eyes',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 100 },
  })

// What the engine answers beneath the plugin; its drawing of a block is the block's text.
const engine = (on: On) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  return clock
}

const text = (body: string) => ({ text: body, isFirstOfReply: false })

const boxOf = async (drawing: { drawn: () => Promise<{ type: string; props?: object }> }) => {
  const tree = await drawing.drawn()
  return tree.type === 'Box' && 'borderStyle' in (tree.props ?? {}) ? tree.props : undefined
}

test("a turn's final answer is boxed; its other blocks are drawn as they are", SLOW, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await say($, 'a1', 'Pulling the data now.')
  await callTool($, 'a2', 'tu1')
  await say($, 'a3', 'Here is the answer.')

  for (const surface of SURFACES) {
    // While the turn runs, no block is known to be the answer.
    const last = await $.ui.mount({
      plugin: 'for-your-eyes', surface, component: 'AssistantMessage', requestId: 'a3', props: text('Here is the answer.'),
    })
    expect(await boxOf(last)).toBeUndefined()
    await last.unmount()
  }

  await $.turn.complete({ answer: 'Here is the answer.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  for (const surface of SURFACES) {
    const update = await $.ui.mount({
      plugin: 'for-your-eyes', surface, component: 'AssistantMessage', requestId: 'a1', props: text('Pulling the data now.'),
    })
    const last = await $.ui.mount({
      plugin: 'for-your-eyes', surface, component: 'AssistantMessage', requestId: 'a3', props: text('Here is the answer.'),
    })
    expect(await boxOf(update)).toBeUndefined()
    expect(await update.find({ text: 'Pulling the data now.' })).toBeDefined()
    if (surface === 'terminal') {
      expect(await boxOf(last)).toMatchObject({ borderStyle: 'round', borderColor: 'claude', backgroundColor: 'memoryBackgroundColor' })
      expect(await last.find({ text: 'Here is the answer.' })).toBeDefined()
    } else {
      expect(await boxOf(last)).toEqual({ flexDirection: 'column', borderStyle: 'round', borderColor: 'claude', paddingX: 1 })
      expect(await last.find({ text: 'Here is the answer.' })).toBeDefined()
    }
    await update.unmount()
    await last.unmount()
  }
})

test('/for-your-eyes turns the box off and on', SLOW, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await say($, 'c1', 'Hello.')
  await $.turn.complete({ answer: 'Hello.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  const only = await $.ui.mount({
    plugin: 'for-your-eyes', surface: 'terminal', component: 'AssistantMessage', requestId: 'c1', props: text('Hello.'),
  })
  expect(await boxOf(only)).toBeDefined()
  expect((await runCommand($)).text).toMatch(/highlight is off/)
  expect(await boxOf(only)).toBeUndefined()
  expect((await runCommand($)).text).toMatch(/highlight is on/)
  expect(await boxOf(only)).toBeDefined()
})

test("a subagent's text is never taken for the answer", SLOW, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await say($, 's1', 'Main update.')
  await row($, 's2', [{ type: 'text', text: 'Sub report.' }], 'agent-1')
  await $.turn.complete({ answer: 'Main update.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  const sub = await $.ui.mount({
    plugin: 'for-your-eyes', surface: 'terminal', component: 'AssistantMessage', requestId: 's2', props: text('Sub report.'),
  })
  const main = await $.ui.mount({
    plugin: 'for-your-eyes', surface: 'terminal', component: 'AssistantMessage', requestId: 's1', props: text('Main update.'),
  })
  expect(await boxOf(sub)).toBeUndefined()
  expect(await boxOf(main)).toBeDefined()
})

test('a desktop item named by its API message is found through the transcript', SLOW, async ($, on) => {
  engine(on)
  const rows = [
    { uuid: 'r1', message: { id: 'msg_A', content: [{ type: 'text', text: 'Pulling the data now.' }] } },
    { uuid: 'r2', message: { id: 'msg_A', content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: {} }] } },
    { uuid: 'r4', message: { id: 'msg_B', content: [{ type: 'text', text: 'Here is the answer.' }] } },
  ]
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', ($, e) => {
    const messageId = e.argv[5]
    const stdout = JSON.stringify(rows.filter(one => one.message.id === messageId).flatMap(one =>
      one.message.content.filter(block => block.type === 'text').map(() => one.uuid)))
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.classic.UserPromptSubmit({ prompt: 'go', transcript_path: '/t.jsonl' })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await say($, 'r1', 'Pulling the data now.')
  await callTool($, 'r2', 'tu1')
  await say($, 'r4', 'Here is the answer.')
  await $.turn.complete({ answer: 'Here is the answer.', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const mount = (requestId: string, body: string) =>
    $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage', requestId, props: text(body) })
  expect(await boxOf(await mount('msg_A-t0', 'Pulling the data now.'))).toBeUndefined()
  expect(await boxOf(await mount('msg_B-t0', 'Here is the answer.'))).toBeDefined()
})

test('a new chat finds its transcript by the session id and folder, and boxes its answer', SLOW, async ($, on) => {
  engine(on)
  mock.env(on, { HOME: '/h' })
  on('session.id', () => ({ value: 'abc' }))
  on('session.root', () => ({ value: '/Users/k' }))
  const path = '/h/.claude/projects/-Users-k/abc.jsonl'
  const rows = [
    { uuid: 'n1', message: { id: 'msg_N', content: [{ type: 'text', text: 'Hi there.' }] } },
  ]
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => {
    const stdout = e.argv[3] === path ? JSON.stringify(rows.map(one => one.uuid)) : '[]'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/Users/k', surface: 'desktop', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await say($, 'n1', 'Hi there.')
  await $.turn.complete({ answer: 'Hi there.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  const answer = await $.ui.mount({
    plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage', requestId: 'msg_N-t0', props: text('Hi there.'),
  })
  expect(await boxOf(answer)).toBeDefined()
  expect(await answer.find({ text: 'Hi there.' })).toBeDefined()
})

test("the turn's last block is boxed even before the transcript file holds it", SLOW, async ($, on) => {
  engine(on)
  on('classic.UserPromptSubmit', () => ({}))
  // The transcript file has not caught up: a lookup in it finds nothing.
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.classic.UserPromptSubmit({ prompt: 'go', transcript_path: '/t.jsonl' })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await say($, 'f1', 'Checking the log.')
  await callTool($, 'f2', 'tu1')
  await say($, 'f3', 'Here is   the answer.\n')
  await $.turn.complete({ answer: 'Here is the answer.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  const mount = (requestId: string, body: string) =>
    $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage', requestId, props: text(body) })
  expect(await boxOf(await mount('msg_Z-t0', 'Here is the answer.'))).toBeDefined()
  expect(await boxOf(await mount('msg_Y-t0', 'Checking the log.'))).toBeUndefined()
})

test('plain desktop answers wrap exactly one native engine response', SLOW, async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  let received: unknown
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    received = e.props
    return { type: 'engine', ref: 0 }
  })
  const body = [
    '## Final result', '',
    'The changes are ready.', '',
    '- First item', '  - Nested item', '',
    '| Name | Value |', '| --- | --- |', '| Result | 42 |', '',
    'Last paragraph.',
  ].join('\n')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.turn.start({ text: 'go', turnId: 'native' })
  await say($, 'native-final', body)
  await $.turn.complete({ answer: body, durationMs: 5, isAborted: false, turnId: 'native', reason: 'answer' })
  const props = { text: body, isFirstOfReply: true, onScreen: null }
  const answer = await $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage',
    requestId: 'native-final', props })
  // The real engine reference is validated by Claude's render contract; a mock
  // Text alone would miss forbidden wrapper props and duplicate response nodes.
  const expected = { type: 'Box',
    props: { flexDirection: 'column', borderStyle: 'round', borderColor: 'claude', paddingX: 1 },
    children: [{ type: 'engine', ref: 0 }] }
  expect(await answer.drawn()).toMatchObject(expected)
  expect(received).toEqual(props)
  await runCommand($)
  expect(await answer.drawn()).toMatchObject({ type: 'engine', ref: 0 })
  expect(received).toEqual(props)
  await runCommand($)
  expect(await answer.drawn()).toMatchObject(expected)
  expect(received).toEqual(props)
})

test('remote file links, web links, and code stay at the original native render site', SLOW, async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  let received: unknown
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    received = e.props
    return { type: 'engine', ref: 0 }
  })
  const cases = [
    'Updated `bets.md`.',
    '[bets.md](</Users/example/Client Work/bets.md>)',
    '[bets.md](/Users/example/Client%20Work/bets.md)',
    '[`bets.md`](./bets.md)',
    '[Source](./src/app.ts#L12)',
    '[notes][file]\n\n[file]: ../notes.md',
    'Open </Users/example/Client Work/bets.md>.',
    'Open /Users/example/notes.md.',
    'Open ~/notes.md.',
    'Open ./notes.md.',
    'Open ../notes.md.',
    'Open C:\\work\\notes.md.',
    'Open \\\\server\\share\\notes.md.',
    'file:///Users/example/notes.md',
    '[Website](https://example.com)',
    'See https://example.com.',
    'See www.example.com.',
    'See <https://example.com>.',
    'Contact mailto:hello@example.com.',
    '![Preview](./preview.png)',
    '```js\nconsole.log("copy me");\n```',
    '~~~js\nconsole.log("copy me");\n~~~',
    '    console.log("copy me");',
  ]
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.turn.start({ text: 'go', turnId: 'links' })
  await say($, 'links-final', cases[0]!)
  await $.turn.complete({ answer: cases[0]!, durationMs: 5, isAborted: false, turnId: 'links', reason: 'answer' })

  for (const body of cases) {
    const props = { text: body, isFirstOfReply: true, onScreen: null }
    for (const surface of SURFACES) {
      const answer = await $.ui.mount({ plugin: 'for-your-eyes', surface, component: 'AssistantMessage',
        requestId: 'links-final', props })
      if (surface === 'terminal') {
        expect(await answer.drawn()).toMatchObject({ type: 'Box',
          props: { borderStyle: 'round', backgroundColor: 'memoryBackgroundColor' },
          children: [{ type: 'engine', ref: 0 }] })
      } else {
        // Exact equality catches even an otherwise harmless-looking wrapper:
        // that wrapper makes Desktop move the response into a plugin slot.
        expect(await answer.drawn()).toEqual({ type: 'engine', ref: 0 })
      }
      expect(received).toEqual(props)
      await answer.unmount()
    }
  }
})

test('summary rows are never restyled, even when their id matches an answer', SLOW, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.turn.start({ text: 'go', turnId: 'summary-turn' })
  await say($, 'summary-row', 'Done.')
  await $.turn.complete({ answer: 'Done.', durationMs: 5, isAborted: false, turnId: 'summary-turn', reason: 'answer' })
  const summary = await $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage',
    requestId: 'summary-row', props: { ...text('Done.'), isSummary: true } })
  expect(await summary.find({ text: 'Done.' })).toBeDefined()
  expect(await boxOf(summary)).toBeUndefined()
})

test('ambiguous repeated text is not mistaken for a different final answer', SLOW, async ($, on) => {
  engine(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '[]', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.classic.UserPromptSubmit({ prompt: 'go', transcript_path: '/t.jsonl' })
  await $.turn.start({ text: 'go', turnId: 'repeat' })
  await say($, 'repeat-update', 'Done.')
  await callTool($, 'repeat-tool', 'tu-repeat')
  await say($, 'repeat-final', 'Done.')
  await $.turn.complete({ answer: 'Done.', durationMs: 5, isAborted: false, turnId: 'repeat', reason: 'answer' })
  const earlier = await $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage',
    requestId: 'msg_UNKNOWN-t0', props: text('Done.') })
  expect(await earlier.find({ text: 'Done.' })).toBeDefined()
  expect(await boxOf(earlier)).toBeUndefined()
})

test('word boundaries are preserved in the live text fallback', SLOW, async ($, on) => {
  engine(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '[]', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.classic.UserPromptSubmit({ prompt: 'go', transcript_path: '/t.jsonl' })
  await $.turn.start({ text: 'go', turnId: 'words' })
  await say($, 'words-final', 'a bc')
  await $.turn.complete({ answer: 'a bc', durationMs: 5, isAborted: false, turnId: 'words', reason: 'answer' })
  const earlier = await $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage',
    requestId: 'msg_OTHER-t0', props: text('ab c') })
  expect(await earlier.find({ text: 'ab c' })).toBeDefined()
  expect(await boxOf(earlier)).toBeUndefined()
})


test('a settled answer is not redrawn by the delayed transcript retry', SLOW, async ($, on) => {
  const clock = engine(on)
  let invalidations = 0
  on('ui.invalidate', ($, e, next) => { invalidations++; return next(e) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.turn.start({ text: 'go', turnId: 'settled' })
  await say($, 'settled-final', 'Select this answer.')
  await $.turn.complete({ answer: 'Select this answer.', durationMs: 5, isAborted: false, turnId: 'settled', reason: 'answer' })
  const answer = await $.ui.mount({ plugin: 'for-your-eyes', surface: 'desktop', component: 'AssistantMessage',
    requestId: 'settled-final', props: text('Select this answer.') })
  expect(await boxOf(answer)).toBeDefined()
  const before = invalidations
  await clock.advance(2100)
  expect(invalidations).toBe(before)
})
