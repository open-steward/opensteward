/**
 * IntaSend payouts — modelled as send-money transactions
 * (`/api/v1/send-money/transactions/`).
 *
 * IntaSend's "Send Payments" API is its payout mechanism: merchants initiate
 * batch disbursements to M-Pesa, bank accounts, or other wallets. The
 * `/api/v1/send-money/transactions/` endpoint lists individual disbursement
 * line items and maps onto the canonical **Payout**.
 *
 * Field mapping:
 *   tracking_id / id  → id / externalId
 *   amount            → amount (major units → minor units)
 *   currency          → currency (defaults to KES)
 *   status / state    → status
 *   account           → destinationLast4 (last 4 chars of phone/account)
 *   narrative         → statementDescriptor
 *   created_at        → createdAt
 *
 * Status mapping (IntaSend send-money states):
 *   COMPLETE / COMPLETED  → paid
 *   FAILED                → failed
 *   PENDING / PROCESSING  → pending
 *   CANCELLED             → cancelled
 *
 * Refs:
 *   https://developers.intasend.com/docs/send-money
 *   https://developers.intasend.com/reference/api_v1_send_money_transactions_list
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawIntasendSendMoneyTransaction {
  id?: number | string
  tracking_id?: string | null
  request_reference_id?: string | null
  name?: string | null
  account?: string | null
  phone_number?: string | null
  amount?: string | number | null
  currency?: string | null
  narrative?: string | null
  status?: string | null
  status_code?: string | null
  state?: string | null
  provider?: string | null
  category?: string | null
  charge?: string | number | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(status: string | null | undefined): PayoutStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETE':
    case 'COMPLETED':
    case 'SUCCESS':
      return 'paid'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    case 'PENDING':
    case 'PROCESSING':
      return 'pending'
    default:
      return 'pending'
  }
}

function last4(account: string | null | undefined): string | undefined {
  const s = (account ?? '').trim()
  return s.length >= 4 ? s.slice(-4) : s || undefined
}

export function transformPayout(raw: RawIntasendSendMoneyTransaction): Payout {
  const id = String(raw.tracking_id ?? raw.request_reference_id ?? raw.id ?? '')
  const dest = raw.account ?? raw.phone_number

  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw.status ?? raw.state),
    method: 'standard',
    arrivalDate: toIsoDatetime(raw.updated_at) ?? undefined,
    destinationLast4: last4(dest),
    statementDescriptor: raw.narrative ?? undefined,
    failureCode: undefined,
    failureMessage: undefined,
    gateway: 'intasend',
    metadata: strMap({
      name: raw.name,
      account: raw.account,
      provider: raw.provider,
      category: raw.category,
      charge: raw.charge,
      status_code: raw.status_code,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
