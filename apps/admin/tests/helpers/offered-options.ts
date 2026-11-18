/**
 * What a rendered page actually lets an operator pick, without typing.
 *
 * Extracted from api-key-tenant-picker.test.ts so more than one picker can be
 * held to it. A live sweep found the same defect in two further views, and the
 * reason it survived is recorded in that file's own header: the bug "was
 * invisible to a test that merely checked the ids appear somewhere in the
 * page". `expect(body).toContain('name="tenantId"')` passes just as happily
 * against a control that offers exactly one option.
 *
 * A `<select>` offers every option it contains, whatever its current value.
 * An `<input list="…">` offers only the datalist suggestions matching what is
 * already in the field — Chrome, Firefox and Safari all filter on the current
 * value — so a pre-filled field hides every option whose value and label do
 * not contain it. Reproducing that rule is what makes an assertion about the
 * operator's experience rather than about the markup.
 */
export function offeredOptions(body: string, fieldName: string): string[] {
  const select = body.match(
    new RegExp(`<select\\b[^>]*\\bname="${fieldName}"[^>]*>([\\s\\S]*?)</select>`),
  )
  if (select) return [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map((m) => m[1])

  const input = body.match(new RegExp(`<input\\b[^>]*\\bname="${fieldName}"[^>]*>`))
  if (!input) return []
  const current = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? ''
  const listId = input[0].match(/\blist="([^"]*)"/)?.[1]
  if (!listId) return current ? [current] : []

  const datalist = body.match(
    new RegExp(`<datalist\\b[^>]*\\bid="${listId}"[^>]*>([\\s\\S]*?)</datalist>`),
  )
  if (!datalist) return current ? [current] : []
  const needle = current.toLowerCase()
  return [...datalist[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*>([^<]*)</g)]
    .filter(([, value, label]) => (value + label).toLowerCase().includes(needle))
    .map((m) => m[1])
}
