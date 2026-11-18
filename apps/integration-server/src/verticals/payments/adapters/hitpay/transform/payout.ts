import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A HitPay Transfer — a bank payout initiated via `POST /v1/transfers`.
 * Listed via `GET /v1/transfers`.
 *
 * Docs: https://docs.hitpayapp.com/apis/payout/get-transfers
 */
export interface RawHitpayTransferBeneficiary {
  id?: string
  status?: string | null
  country?: string | null
  currency?: string | null
  transfer_method?: string | null
  transfer_type?: string | null
  holder_name?: string | null
  holder_type?: string | null
  account_number?: string | null
  bank_name?: string | null
  bank_id?: string | null
  bank_swift_code?: string | null
  [k: string]: unknown
}

export interface RawHitpayTransferFee {
  amount?: string | number | null
  currency?: string | null
  paid_by?: string | null
  [k: string]: unknown
}

export interface RawHitpayTransfer {
  id?: string
  beneficiary?: RawHitpayTransferBeneficiary | null
  payment_currency?: string | null
  payment_amount?: string | number | null
  source_currency?: string | null
  source_amount?: string | number | null
  exchange_rate?: string | number | null
  fee?: RawHitpayTransferFee | null
  status?: string | null
  reference?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * Map HitPay transfer status → canonical PayoutStatus.
 * HitPay statuses: pending | processing | completed | failed | rejected
 */
function mapStatus(raw: RawHitpayTransfer): PayoutStatus {
  switch ((raw.status ?? raw.beneficiary?.status ?? '').toLowerCase()) {
    case 'completed':
    case 'paid':
      return 'paid'
    case 'processing':
    case 'in_transit':
      return 'in_transit'
    case 'failed':
    case 'rejected':
      return 'failed'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'pending':
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawHitpayTransfer): Payout {
  const ben = raw.beneficiary ?? {}
  const last4 = (ben.account_number ?? '').replace(/\D/g, '').slice(-4) || undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.payment_amount),
    currency: pickCurrency(raw.payment_currency ?? ben.currency),
    status: mapStatus(raw),
    method: 'standard',
    arrivalDate: undefined,
    destinationLast4: last4,
    statementDescriptor: raw.reference ?? undefined,
    failureCode: undefined,
    failureMessage: undefined,
    gateway: 'hitpay',
    metadata: strMap({
      source_currency: raw.source_currency,
      source_amount: raw.source_amount,
      exchange_rate: raw.exchange_rate,
      bank_name: ben.bank_name,
      holder_name: ben.holder_name,
      transfer_method: ben.transfer_method,
      transfer_type: ben.transfer_type,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
