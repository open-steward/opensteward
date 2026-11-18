/**
 * Replace content between marker comments in a string.
 * Used by generate-claude-md-adapters and similar scripts.
 *
 * Example markers: <!-- BEGIN ADAPTERS --> / <!-- END ADAPTERS -->
 */
export function replaceBetweenMarkers(
  content: string,
  beginMarker: string,
  endMarker: string,
  replacement: string,
): string {
  const beginIdx = content.indexOf(beginMarker)
  const endIdx = content.indexOf(endMarker)
  if (beginIdx === -1 || endIdx === -1) {
    console.warn(`⚠ Markers not found: ${beginMarker} / ${endMarker}`)
    return content
  }
  return (
    content.slice(0, beginIdx + beginMarker.length) +
    '\n' +
    replacement +
    '\n' +
    content.slice(endIdx)
  )
}
