/**
 * Papercups customer → canonical Contact transform.
 *
 * API: GET /api/v1/customers, GET /api/v1/customers/:id
 * Response envelope: { data: RawPapercupsCustomer }
 *
 * PII surfaced: email, name, phone only. Browser, OS, IP, geo refused.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPapercupsCustomer {
  id: string
  external_id?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: { id?: string; name?: string } | null
  created_at?: string
  updated_at?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawPapercupsCustomer): Contact {
  return {
    id: String(raw.id),
    externalId: raw.external_id ? String(raw.external_id) : String(raw.id),
    email: pickStr(raw.email) as string | undefined,
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: raw.company?.id ? String(raw.company.id) : undefined,
    platform: 'papercups',
    metadata: strMap({
      companyName: raw.company?.name,
    }),
    raw,
  }
}
