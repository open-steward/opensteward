import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawPayPalPayer {
  payer_id?: string
  email_address?: string
  name?: { given_name?: string; surname?: string }
  phone?: { phone_number?: { national_number?: string } }
  address?: Record<string, string>
}

export function transformCustomer(raw: RawPayPalPayer): Customer {
  const id = raw.payer_id ?? raw.email_address ?? ''
  const name = [raw.name?.given_name, raw.name?.surname].filter(Boolean).join(' ').trim() || undefined
  return {
    id,
    externalId: id,
    email: raw.email_address,
    name,
    phone: raw.phone?.phone_number?.national_number,
    gateway: 'paypal',
    metadata: strMap(raw.address),
    raw,
  }
}
