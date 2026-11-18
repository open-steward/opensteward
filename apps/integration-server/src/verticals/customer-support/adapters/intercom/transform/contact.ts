/**
 * Intercom contact (a `user` or a `lead`) → canonical Contact. PII-minimal:
 * email, name and phone only; the role and the customer's own external id go
 * to metadata. Fields: the `contact` schema of the 2.16 OpenAPI description.
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { Contact } from '../../../schema'
import { pickEmail, pickStr, strMap } from './shared'

export interface RawIntercomContact {
  type?: string
  id: string
  external_id?: string | null
  role?: string
  email?: string | null
  phone?: string | null
  name?: string | null
  created_at?: number
  updated_at?: number
  [key: string]: unknown
}

export function transformContact(raw: RawIntercomContact): Contact {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    email: pickEmail(raw.email),
    name: pickStr(raw.name) ?? pickStr(raw.email) ?? '',
    phone: pickStr(raw.phone),
    platform: 'intercom',
    metadata: strMap({ role: raw.role, externalId: raw.external_id }),
    raw,
  }
}
