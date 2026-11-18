/**
 * SalesNexus contact transforms.
 *
 * SalesNexus contacts are identified by a `contact-id` string.  All field
 * values live in a `field-values` map keyed by the numeric field ID string.
 * The well-known field IDs are defined in ../constants.ts.
 *
 * Transforms NEVER throw — missing optional fields return undefined.
 */
import type { Contact } from '../../../schema/contact'
import { CONTACT_FIELDS } from '../constants'

/** Raw SalesNexus contact as returned by get-contact-info / get-contacts. */
export interface RawSalesnexusContact {
  /** Platform contact identifier. */
  'contact-id': string
  /** Field-value map keyed by numeric field ID string. */
  'field-values'?: Record<string, string | null | undefined>
  [key: string]: unknown
}

/** Extract a field value from the field-values map, returning undefined if absent/null. */
function fv(raw: RawSalesnexusContact, id: string): string | undefined {
  const v = raw['field-values']?.[id]
  return v == null || v === '' ? undefined : v
}

/** Coerce a SalesNexus datetime string to ISO-8601 or return undefined. */
function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

export function transformContact(raw: RawSalesnexusContact): Contact {
  const firstName = fv(raw, CONTACT_FIELDS.FIRST_NAME)
  const lastName = fv(raw, CONTACT_FIELDS.LAST_NAME)
  const joinedName = [firstName, lastName].filter(Boolean).join(' ')
  const fullName = fv(raw, CONTACT_FIELDS.FULL_NAME) ?? (joinedName !== '' ? joinedName : undefined)

  return {
    id: String(raw['contact-id']),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: fv(raw, CONTACT_FIELDS.EMAIL),
    phone: fv(raw, CONTACT_FIELDS.PHONE),
    mobile: fv(raw, CONTACT_FIELDS.MOBILE),
    title: fv(raw, CONTACT_FIELDS.TITLE),
    owner_id: fv(raw, CONTACT_FIELDS.OWNER_ID),
    created_at: toIso(fv(raw, CONTACT_FIELDS.CREATED_DATE)),
    updated_at: toIso(fv(raw, CONTACT_FIELDS.MODIFIED_DATE)),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build a `contact-field-data` map suitable for create-contact / update-contact.
 * Only includes fields that are explicitly set in `data`.
 */
export function untransformContact(data: Partial<Contact>): Record<string, string> {
  const out: Record<string, string> = {}
  if (data.first_name != null) out[CONTACT_FIELDS.FIRST_NAME] = data.first_name
  if (data.last_name != null) out[CONTACT_FIELDS.LAST_NAME] = data.last_name
  if (data.name != null) out[CONTACT_FIELDS.FULL_NAME] = data.name
  if (data.email != null) out[CONTACT_FIELDS.EMAIL] = data.email
  if (data.phone != null) out[CONTACT_FIELDS.PHONE] = data.phone
  if (data.mobile != null) out[CONTACT_FIELDS.MOBILE] = data.mobile
  if (data.title != null) out[CONTACT_FIELDS.TITLE] = data.title
  return out
}
