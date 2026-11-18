import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { pickCurrency, strMap } from './shared'

/** Tap customer object — https://developers.tap.company/reference/retrieve-a-customer */
export interface RawTapCustomer {
  id?: string
  object?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  email?: string
  phone?: { country_code?: string | number; number?: string | number }
  currency?: string
  description?: string | null
  metadata?: Record<string, unknown>
  created?: string | number
  [k: string]: unknown
}

function joinName(raw: RawTapCustomer): string | undefined {
  const name = [raw.first_name, raw.middle_name, raw.last_name].filter(Boolean).join(' ').trim()
  return name || undefined
}

function joinPhone(phone: RawTapCustomer['phone']): string | undefined {
  if (!phone) return undefined
  const cc = phone.country_code != null ? String(phone.country_code).replace(/^\+/, '') : ''
  const num = phone.number != null ? String(phone.number) : ''
  const joined = `${cc ? `+${cc}` : ''}${num}`.trim()
  return joined || undefined
}

export function transformCustomer(raw: RawTapCustomer): Customer {
  const created = toIsoDatetime(raw.created)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email ?? undefined,
    name: joinName(raw),
    phone: joinPhone(raw.phone),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    description: raw.description ?? undefined,
    gateway: 'tap-payments',
    metadata: strMap(raw.metadata),
    createdAt: created,
    updatedAt: created,
    raw,
  }
}
