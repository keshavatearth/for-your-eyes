// Claude Desktop recognizes these as file links, but its file-open preflight
// treats angle-bracket destinations as missing, including paths without spaces.
// Use an ordinary Markdown destination instead, encoding characters that need
// the angle-bracket form. This changes only the drawing, never the transcript.
export function desktopFileLinks(text: string): string {
  let fence = ''
  let inline = ''
  return text.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence !== '') {
      if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && marker[2]!.trim() === '') fence = ''
      return line
    }
    if (marker) { fence = marker[1]!; return line }
    if (/^(?: {4}|\t)/.test(line)) return line

    // Consume a whole link before inspecting backticks in its label. Code
    // spans (including spans crossing a newline) and image syntax stay intact.
    return line.replace(/(`+)|(?<!!)\[([^\]\r\n]*)\]\(<([^<>\r\n]+)>\)/g,
      (whole: string, ticks: string | undefined, label: string, target: string) => {
        if (ticks !== undefined) {
          if (inline === '') inline = ticks
          else if (inline === ticks) inline = ''
          return whole
        }
        if (inline !== '' || target.trim() !== target) return whole
        // Preserve web URLs, mail links, anchors, and other schemes. A Windows
        // drive prefix is a local path, not a URI scheme.
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) return whole
        const destination = target.replace(/[ \t()]/g, char => ({ ' ': '%20', '\t': '%09', '(': '%28', ')': '%29' })[char]!)
        return `[${label}](${destination})`
      })
  }).join('\n')
}
