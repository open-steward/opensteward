/**
 * Field readers shared by the Barantum transforms.
 *
 * Every `get_list_data` example in the Barantum CRM collection
 * (https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5) writes an
 * unset relation as the string "-" and an unset text field as null or "":
 * `"related_deals_uuid": "-"`, `"deals_organization_uuid": "-"`,
 * `"contacts_last_name": null`, `"deals_description": ""`.
 */

/** A text field, or undefined when the platform sent null, "" or the "-" placeholder. */
export function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' || s === '-' ? undefined : v
}

/** The record's own uuid. Required: a row without one cannot be read back. */
export function requireUuid(raw: Record<string, unknown>, field: string, module: string): string {
  const id = text(raw[field])
  if (id === undefined) {
    throw new Error(`Barantum ${module} row has no ${field}`)
  }
  return id
}
