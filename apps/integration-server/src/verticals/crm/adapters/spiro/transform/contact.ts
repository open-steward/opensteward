/**
 * Spiro contacts (JSON:API `contact` resources) → canonical Contact.
 *
 * GET /api/v1/contacts and GET /api/v1/contacts/{id}, documented example item:
 *   { "id": "208", "type": "contact",
 *     "attributes": { "id": 208, "first_name": "Charles", "last_name": "Howell",
 *       "created_at": "2026-09-01T09:57:38.521Z", "updated_at": "2026-09-01T09:57:38.521Z",
 *       "title": "agriculturist", "phone": "303.165.1111", "mobile_phone": "731.348.1560",
 *       "home_phone": null, "email": "charles@armstrong.test", "description": null,
 *       "custom": {}, "external_id": null, "email_opt_out": false },
 *     "relationships": { "company": { "data": { "id": "441", "type": "company" } },
 *                        "user": { "data": { "id": "998", "type": "user" } } } }
 *
 * The owning user is the `user` relationship. Spiro sends no display name, so
 * `name` is left unset rather than composed.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import type { Contact } from '../../../schema/contact'
import { relatedId, type SpiroResource } from '../client'

export interface SpiroContactAttributes {
  id: number
  first_name: string | null
  last_name: string | null
  created_at: string
  updated_at: string
  title: string | null
  phone: string | null
  mobile_phone: string | null
  home_phone: string | null
  email: string | null
  description: string | null
  custom: Record<string, unknown>
  external_id: string | null
  email_opt_out: boolean
}

export type RawSpiroContact = SpiroResource<SpiroContactAttributes>

export function transformContact(raw: RawSpiroContact): Contact {
  const a = raw.attributes
  return {
    id: raw.id,
    first_name: a.first_name,
    last_name: a.last_name,
    email: a.email,
    phone: a.phone,
    mobile: a.mobile_phone,
    title: a.title,
    company_id: relatedId(raw, 'company'),
    owner_id: relatedId(raw, 'user'),
    created_at: a.created_at,
    updated_at: a.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile_phone = data.mobile
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
