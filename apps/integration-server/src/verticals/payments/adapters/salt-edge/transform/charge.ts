import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Salt Edge transaction (Account Information API v6). The closest canonical
 * fit in the payments vertical is `Charge`: a single money movement on a bank
 * account. `amount` is a signed decimal in major units (negative = debit),
 * `status` is `posted` or `pending`, and `made_on` is the value date.
 *
 * https://docs.saltedge.com/v6/api_reference/#transactions
 */
export interface RawSaltEdgeTransaction {
  id?: string | number
  account_id?: string | number
  duplicated?: boolean
  mode?: string
  status?: string
  made_on?: string
  amount?: number | string
  currency_code?: string
  description?: string
  category?: string
  extra?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSaltEdgeTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'posted':
      return 'succeeded'
    case 'pending':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawSaltEdgeTransaction): Charge {
  const id = String(raw.id ?? '')
  const currency = pickCurrency(raw.currency_code)
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw),
    customerId: raw.account_id != null ? String(raw.account_id) : undefined,
    description: raw.description || undefined,
    gateway: 'salt-edge',
    metadata: strMap({
      account_id: raw.account_id,
      mode: raw.mode,
      category: raw.category,
      duplicated: raw.duplicated,
      ...raw.extra,
    }),
    createdAt: toIsoDatetime(raw.created_at ?? raw.made_on),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
