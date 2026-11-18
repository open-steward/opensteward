/**
 * Belvo transaction → canonical Charge.
 *
 * Belvo transactions are read-only bank-account movements (a purchase, a
 * transfer, a salary deposit), not gateway charges, but the canonical Charge
 * is the closest fit: amount + currency + status + customer linkage. Belvo
 * `amount` is always positive with direction carried in `type`
 * (INFLOW / OUTFLOW), and money is quoted in MAJOR units — we scale to minor
 * units. `account` may be either a nested object or a bare id string
 * depending on the endpoint.
 *
 * Docs: https://developers.belvo.com/apis/belvoopenapispec/transactions
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

interface RawBelvoMerchant {
  merchant_name?: string | null
  logo?: string | null
  website?: string | null
}

interface RawBelvoTransactionAccount {
  id?: string
  category?: string | null
  type?: string | null
  name?: string | null
  number?: string | null
  currency?: string | null
}

export interface RawBelvoTransaction {
  id?: string
  internal_identification?: string | null
  account?: RawBelvoTransactionAccount | string | null
  amount?: number | null
  local_currency_amount?: number | null
  balance?: number | null
  currency?: string | null
  description?: string | null
  observations?: string | null
  reference?: string | null
  /** Direction: INFLOW | OUTFLOW | null. */
  type?: string | null
  /** PENDING | PROCESSED | UNCATEGORIZED | null. */
  status?: string | null
  category?: string | null
  subcategory?: string | null
  merchant?: RawBelvoMerchant | null
  /** YYYY-MM-DD when the movement occurred. */
  value_date?: string | null
  accounting_date?: string | null
  /** ISO-8601 timestamp when Belvo collected the data point. */
  collected_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function accountId(account: RawBelvoTransaction['account']): string | undefined {
  if (!account) return undefined
  if (typeof account === 'string') return account
  return pickStr(account.id)
}

/**
 * Belvo transactions describe completed bank movements; there is no
 * authorise/capture lifecycle. We map PROCESSED → succeeded, PENDING →
 * pending, and the uncategorised/unknown remainder to pending.
 */
function mapStatus(raw: RawBelvoTransaction): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PROCESSED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawBelvoTransaction): Charge {
  const acct = typeof raw.account === 'object' && raw.account ? raw.account : undefined
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency ?? acct?.currency),
    status: mapStatus(raw),
    customerId: accountId(raw.account),
    description: raw.description ?? raw.merchant?.merchant_name ?? undefined,
    gateway: 'belvo',
    metadata: strMap({
      type: raw.type,
      category: raw.category,
      subcategory: raw.subcategory,
      reference: raw.reference,
      observations: raw.observations,
      value_date: raw.value_date,
      accounting_date: raw.accounting_date,
      local_currency_amount: raw.local_currency_amount,
      balance: raw.balance,
      internal_identification: raw.internal_identification,
      merchant_name: raw.merchant?.merchant_name,
    }),
    createdAt: toIsoDatetime(raw.collected_at ?? raw.value_date),
    updatedAt: toIsoDatetime(raw.created_at ?? raw.collected_at),
    raw,
  }
}
