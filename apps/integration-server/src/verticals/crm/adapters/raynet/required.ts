/**
 * A field the Raynet schema marks required (PUT /company/ `name`, PUT
 * /businessCase/ `name`, PUT /businessCasePhase/ `code01`) that a canonical
 * record also requires. A row without it breaks the documented contract, so it
 * is refused with a 502 rather than filled in with a made-up value.
 */
export function requiredText(value: string | null | undefined, what: string): string {
  if (typeof value === 'string' && value !== '') return value
  throw Object.assign(new Error(`Raynet returned ${what} without its required name`), {
    statusCode: 502,
  })
}
