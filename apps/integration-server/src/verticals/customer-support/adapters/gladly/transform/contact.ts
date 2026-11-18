import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGladlyUser {
  id: number
  external_id?: string | null
  name?: string
  email?: string
  phone?: string | null
  organization_id?: number | null
  role?: string
  [key: string]: unknown
}

export function transformContact(raw: RawGladlyUser): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: raw.organization_id ? String(raw.organization_id) : undefined,
    platform: 'gladly',
    metadata: strMap({}),
    raw,
  }
}
