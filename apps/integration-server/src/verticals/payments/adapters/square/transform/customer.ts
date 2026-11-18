import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawSquareCustomer {
  id: string
  email_address?: string
  given_name?: string
  family_name?: string
  phone_number?: string
  reference_id?: string
  address?: Record<string, string>
  note?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawSquareCustomer): Customer {
  const name = [raw.given_name, raw.family_name].filter(Boolean).join(' ').trim() || undefined
  return {
    id: raw.id,
    externalId: raw.id,
    email: raw.email_address,
    name,
    phone: raw.phone_number,
    description: raw.note,
    gateway: 'square',
    metadata: strMap({ reference_id: raw.reference_id }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
