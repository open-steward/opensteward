import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * A contact as "Get contact list" / "Get contact" return it
 * (GET /api/v2/contacts, Upsales API collection). Fields read here are the
 * sample response's `id`, `name`, `phone`, `cellPhone`, `email`, `title`,
 * `client {id}`, `regDate` and `modDate`.
 */
export interface RawUpsalesContact {
  id: number | string
  name?: string | null
  email?: string | null
  phone?: string | null
  cellPhone?: string | null
  title?: string | null
  client?: { id: number | string; name?: string } | null
  regDate?: string | null
  modDate?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawUpsalesContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    mobile: raw.cellPhone,
    title: raw.title,
    company_id: raw.client?.id != null ? String(raw.client.id) : undefined,
    created_at: toIsoDatetime(raw.regDate),
    updated_at: toIsoDatetime(raw.modDate),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.company_id !== undefined) out.client = { id: Number(data.company_id) }
  if (data.owner_id !== undefined) out.user = { id: Number(data.owner_id) }
  return out
}
