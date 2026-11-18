import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawPaddleCustomer {
  id?: string
  email?: string
  name?: string
  marketing_consent?: boolean
  locale?: string
  status?: string
  created_at?: string
  updated_at?: string
  custom_data?: Record<string, unknown>
  [k: string]: unknown
}

export function transformCustomer(raw: RawPaddleCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: raw.name,
    gateway: 'paddle',
    metadata: strMap({ ...raw.custom_data, locale: raw.locale, status: raw.status }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
