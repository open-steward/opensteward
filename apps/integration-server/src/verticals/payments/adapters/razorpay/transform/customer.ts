import type { Customer } from '../../../schema/customer'
import { strMap, toIso } from './shared'

export interface RawRazorpayCustomer {
  id?: string
  name?: string
  email?: string
  contact?: string
  gstin?: string
  notes?: Record<string, unknown>
  created_at?: number
  [k: string]: unknown
}

export function transformCustomer(raw: RawRazorpayCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: raw.name,
    phone: raw.contact,
    gateway: 'razorpay',
    metadata: strMap({ ...raw.notes, gstin: raw.gstin }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
