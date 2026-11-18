/**
 * ZipBnpl Charge -> canonical Charge.
 */

import type { Charge } from '../../../schema/charge'
import { toIsoDatetime, pickStr, pickNum, strMap } from './shared'

export interface RawZipBnplCharge {
  id: string
  amount?: number | string | null
  currency?: string | null
  status?: string | null
  description?: string | null
  customer_id?: string | null
  customer?: string | null
  payment_method_id?: string | null
  captured?: boolean | null
  failure_message?: string | null
  failure_code?: string | null
  created_at?: string | number | null
  updated_at?: string | number | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformCharge(raw: RawZipBnplCharge): Charge {
  const amt = pickNum(raw.amount) ?? 0
  const cur = (typeof raw.currency === 'string' ? raw.currency.toUpperCase() : '') || 'USD'
  const status = (typeof raw.status === 'string' ? raw.status : String(raw.status ?? 'unknown')) || 'unknown'
  return {
    id: raw.id,
    externalId: raw.id,
    amount: Math.round(amt),
    currency: cur,
    status,
    description: pickStr(raw.description),
    customerId: pickStr(raw.customer_id) ?? pickStr(raw.customer),
    paymentMethodId: pickStr(raw.payment_method_id),
    captured: typeof raw.captured === 'boolean' ? raw.captured : undefined,
    failureMessage: pickStr(raw.failure_message),
    failureCode: pickStr(raw.failure_code),
    gateway: 'zip-bnpl',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
