import type { Contact } from '../../../schema/contact'
import type { NetHuntRecord } from '../types'

/**
 * A record of the folder whose `role` is `contact` → canonical Contact.
 *
 * NetHunt folders are user-defined: every field except the record name is a
 * custom field keyed by a workspace-specific id, and the API documents no role
 * binding for contact fields (only the Tasks folder's fields carry roles). So
 * only the documented record properties are mapped: `id`, the `name` key ("The
 * `name` key sets the record display name"), `createdISO` and `updatedISO`.
 * Every custom field stays in `metadata.fields`.
 */
export function transformContact(raw: NetHuntRecord): Contact {
  const name = raw.fields['name']
  return {
    id: raw.id,
    name: typeof name === 'string' && name !== '' ? name : undefined,
    created_at: raw.createdISO,
    updated_at: raw.updatedISO,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['first_name'] = data.first_name
  if (data.last_name !== undefined) out['last_name'] = data.last_name
  if (data.email !== undefined) out['email'] = data.email
  if (data.phone !== undefined) out['phone'] = data.phone
  if (data.title !== undefined) out['position'] = data.title
  if (data.company_id !== undefined) out['company'] = data.company_id
  return out
}
