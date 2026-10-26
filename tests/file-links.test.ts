import { expect, test } from 'claude-code/testing'
import { desktopFileLinks } from '../hooks/file-links'

test('desktop file destinations drop angle brackets and encode only necessary characters', () => {
  const cases = [
    ['[bets](</Users/example/bets.md>)', '[bets](/Users/example/bets.md)'],
    ['[bets](</Users/example/Client Work/bets.md>)', '[bets](/Users/example/Client%20Work/bets.md)'],
    ['[bets](</Users/example/Client%20Work/bets.md>)', '[bets](/Users/example/Client%20Work/bets.md)'],
    ['[call](<./Call notes (final).md#L12>)', '[call](./Call%20notes%20%28final%29.md#L12)'],
    ['[`bets.md`](<../Client Work/bets.md>)', '[`bets.md`](../Client%20Work/bets.md)'],
  ]
  for (const [before, after] of cases) expect(desktopFileLinks(before!)).toBe(after!)
})

test('ordinary destinations, web links, anchors and images are preserved', () => {
  const cases = [
    '[bets](/Users/example/Client%20Work/bets.md)',
    '[website](<https://example.com/a%20b>)',
    '[mail](<mailto:hello@example.com>)',
    '[anchor](<#section>)',
    '[website](<//example.com/file.md>)',
    '[editor](<vscode://file/example.md>)',
    '![image](</Users/example/image name.png>)',
    '[incomplete](</Users/example/bets.md>',
  ]
  for (const source of cases) expect(desktopFileLinks(source)).toBe(source)
})

test('file-link examples inside code are preserved', () => {
  const link = '[bets](</Users/example/Client Work/bets.md>)'
  const cases = [
    '`' + link + '`',
    '``' + link + '``',
    '```md\n' + link + '\n```',
    '~~~md\n' + link + '\n~~~',
    '````md\n```\n' + link + '\n```\n````',
    '```md\n' + link,
    '    ' + link,
    '\t' + link,
    '`first line\n' + link + '\nlast line`',
  ]
  for (const source of cases) expect(desktopFileLinks(source)).toBe(source)
})
