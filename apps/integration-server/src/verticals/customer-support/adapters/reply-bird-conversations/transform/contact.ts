/**
 * Bird contact → canonical Contact.
 *
 * Fields from the `Contact` schema of `GET /v1/contacts` and
 * `GET /v1/contacts/{contact_id}` (https://bird.com/docs/api/reference/list-contacts):
 *   - `id` (string, required): "ID of the contact, accepted by every operation that takes a `contact_id`."
 *   - `email` (nullable string, required): "`null` when the contact has no email address."
 *   - `phone_number` (nullable string, required): "normalized international form: a leading `+` and four to 15 digits"
 *   - `first_name` / `last_name` (nullable string)
 *   - `external_id` (nullable string): "Your own identifier for this contact"
 *   - `created_at` / `updated_at` (string, required)
 *
 * Custom `data` properties and `audiences` are not mapped (the canonical
 * Contact is PII-minimal).
 */
import type { Contact } from '../../../schema'

export interface RawBirdContact {
  id: string
  email: string | null
  phone_number: string | null
  first_name?: string | null
  last_name?: string | null
  external_id?: string | null
  data?: Record<string, unknown>
  audiences?: Array<{ id: string; name?: string }>
  created_at: string
  updated_at: string
}

export function transformContact(raw: RawBirdContact): Contact {
  const name = [raw.first_name, raw.last_name].filter((p): p is string => !!p).join(' ')
  const metadata: Record<string, string> = {
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
  if (raw.external_id) metadata['birdExternalId'] = raw.external_id
  return {
    id: raw.id,
    externalId: raw.id,
    ...(raw.email ? { email: raw.email } : {}),
    name,
    ...(raw.phone_number ? { phone: raw.phone_number } : {}),
    platform: 'reply-bird-conversations',
    metadata,
    raw,
  }
}
