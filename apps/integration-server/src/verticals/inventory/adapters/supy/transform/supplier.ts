/**
 * Supy "supplier" → canonical Supplier transform.
 *
 * Supy tracks supplier contact details, default currency, and lead times.
 * Status is a string field; anything other than 'active' is treated as inactive.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawSupySupplier {
  id: string
  name?: string
  email?: string
  phone?: string
  contactName?: string
  currency?: string
  leadTimeDays?: number
  status?: string
  paymentTerms?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSupySupplier): Supplier {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive: (raw.status ?? 'active').toLowerCase() === 'active',
    platform: 'supy',
    metadata: strMap({
      contactName: raw.contactName,
      status: raw.status,
      paymentTerms: raw.paymentTerms,
    }),
    raw,
  }
}
