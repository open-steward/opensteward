import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRichpanelCustomer {
  id: string | number
  uid?: string | null
  name?: string
  email?: string | null
  phone?: string | null
  organization_id?: string | number | null
  [key: string]: unknown
}

export function transformContact(raw: RawRichpanelCustomer): Contact {
  return {
    id: String(raw.id),
    externalId: pickStr(raw.uid) ?? String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: raw.organization_id ? String(raw.organization_id) : undefined,
    platform: 'richpanel',
    metadata: strMap({}),
    raw,
  }
}
