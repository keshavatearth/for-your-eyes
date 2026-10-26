// Remote clients mount a wrapped engine response in a separate render
// container. Keeping the engine reference intact is not enough to guarantee
// that file chips, selection, and other native controls behave the same there.
// Leave interactive Markdown at its original render site instead. Be
// conservative: missing a frame is preferable to losing a native interaction.
export function needsNativeRendering(surface: string, text: string): boolean {
  if (surface === 'terminal') return false

  // Inline/fenced code (including file references), Markdown links/images and
  // reference links, autolinks, and HTML. Do not parse or rewrite their targets.
  if (/[`[\]<>]/.test(text) || /^(?: {0,3}~{3,}| {4}\S|\t\S)/m.test(text)) return true

  // Bare URLs and filesystem paths can also receive native click behavior.
  return /\b[a-z][a-z0-9+.-]*:\/\//i.test(text)
    || /(?:^|\s)(?:mailto:|www\.|\.{1,2}\/|\/|~\/|[a-z]:\\|\\\\)/im.test(text)
}
