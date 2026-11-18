import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawMPCustomer {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: { area_code?: string; number?: string }
  identification?: { type?: string; number?: string }
  description?: string
  date_created?: string
  date_last_updated?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawMPCustomer): Customer {
  const name = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim() || undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name,
    phone: raw.phone?.number,
    description: raw.description,
    gateway: 'mercado-pago',
    metadata: strMap({
      identification_type: raw.identification?.type,
      identification_number: raw.identification?.number,
      area_code: raw.phone?.area_code,
    }),
    createdAt: raw.date_created,
    updatedAt: raw.date_last_updated,
    raw,
  }
}
