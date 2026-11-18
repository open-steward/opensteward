import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

/**
 * A Paysafe **Customer Vault profile** (customervault/v1) maps onto the
 * canonical **Customer**. The merchant's own key is `merchantCustomerId`;
 * Paysafe assigns the `id`.
 */
export interface RawPaysafeProfile {
  id?: string
  merchantCustomerId?: string
  status?: string
  locale?: string
  firstName?: string
  middleName?: string
  lastName?: string
  email?: string
  phone?: string
  cellPhone?: string
  nationality?: string
  dateOfBirth?: { day?: number; month?: number; year?: number }
  paymentToken?: string
  creationDate?: string
  lastModified?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawPaysafeProfile): Customer {
  const name = [raw.firstName, raw.middleName, raw.lastName].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? raw.merchantCustomerId ?? ''),
    externalId: String(raw.id ?? raw.merchantCustomerId ?? ''),
    email: pickStr(raw.email),
    name: name || undefined,
    phone: pickStr(raw.phone ?? raw.cellPhone),
    gateway: 'paysafe',
    metadata: strMap({
      merchantCustomerId: raw.merchantCustomerId,
      status: raw.status,
      locale: raw.locale,
      nationality: raw.nationality,
      paymentToken: raw.paymentToken,
    }),
    createdAt: toIsoDatetime(raw.creationDate),
    updatedAt: toIsoDatetime(raw.lastModified ?? raw.creationDate),
    raw,
  }
}
