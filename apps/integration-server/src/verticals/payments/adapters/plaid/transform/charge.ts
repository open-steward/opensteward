/**
 * Plaid Transfer → canonical Charge.
 *
 * A Plaid Transfer is a single ACH/RTP money movement. A `type: 'debit'`
 * transfer pulls money *into* the originator account — the closest analogue to
 * a card charge — so we surface debits (and, generically, any transfer) as
 * Charges. `type: 'credit'` transfers (money out) are additionally surfaced as
 * Payouts via `transform/payout.ts`.
 *
 * Money arrives as a decimal string in major units (`"12.34"`); convert to
 * minor units. Timestamps are RFC-3339 strings, normalised with toIsoDatetime.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPlaidTransferUser {
  legal_name?: string | null
  email_address?: string | null
  phone_number?: string | null
}

export interface RawPlaidTransfer {
  id?: string
  account_id?: string
  funding_account_id?: string | null
  type?: string
  amount?: string
  iso_currency_code?: string | null
  description?: string | null
  status?: string
  network?: string | null
  user?: RawPlaidTransferUser | null
  failure_reason?: { description?: string | null; ach_return_code?: string | null } | null
  metadata?: Record<string, unknown> | null
  created?: string
  [key: string]: unknown
}

/**
 * Plaid transfer.status → canonical ChargeStatus.
 *   pending / posted          → pending   (in flight)
 *   settled / funds_available → succeeded (terminal success)
 *   failed                    → failed
 *   returned                  → refunded  (funds came back)
 *   cancelled                 → cancelled
 */
export function mapChargeStatus(raw: RawPlaidTransfer): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'settled':
    case 'funds_available':
      return 'succeeded'
    case 'pending':
    case 'posted':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'returned':
      return 'refunded'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPlaidTransfer): Charge {
  const id = String(raw.id ?? '')
  const status = mapChargeStatus(raw)
  return {
    id,
    externalId: id,
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.iso_currency_code),
    status,
    captured: status === 'succeeded',
    description: raw.description ?? undefined,
    receiptEmail: raw.user?.email_address ?? undefined,
    failureMessage: raw.failure_reason?.description ?? undefined,
    failureCode: raw.failure_reason?.ach_return_code ?? undefined,
    gateway: 'plaid',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      type: raw.type,
      network: raw.network,
      account_id: raw.account_id,
      funding_account_id: raw.funding_account_id,
    }),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
