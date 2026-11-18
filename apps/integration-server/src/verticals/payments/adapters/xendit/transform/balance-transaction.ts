/**
 * Xendit Balance Transaction → canonical BalanceTransaction.
 *
 * Xendit exposes balance history via the Transactions API (v4):
 *   GET /transactions        — list all balance-affecting events
 *   GET /transactions/{id}   — get a single event
 *
 * Each transaction object records a money movement (charge, refund, payout,
 * fee, etc.) against the merchant's wallet / settlement balance. The `type`
 * field carries values such as PAYMENT, REFUND, PAYOUT, TRANSFER, etc.
 *
 * Money: Xendit amounts in this API are plain numbers in major currency units
 * for non-IDR currencies, or integer IDR. We round to integer minor units.
 *
 * Docs: https://docs.xendit.co/apidocs/list-transactions
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap, toMinorAmount } from './shared'

// ── Raw shape ─────────────────────────────────────────────────────────────────

export interface RawXenditTransaction {
  id?: string
  reference_id?: string | null
  type?: string | null
  status?: string | null
  channel_code?: string | null
  account_details?: Record<string, unknown> | null
  net_amount?: number
  fee?: number | null
  currency?: string
  business_id?: string | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapType(raw: string | null | undefined): BalanceTransactionType {
  const t = (raw ?? '').toUpperCase()
  if (t.startsWith('PAYMENT') || t.startsWith('CHARGE')) return 'charge'
  if (t.startsWith('REFUND')) return 'refund'
  if (t.startsWith('PAYOUT') || t.startsWith('DISBURSEMENT')) return 'payout'
  if (t.startsWith('TRANSFER')) return 'transfer'
  if (t.startsWith('FEE')) return 'fee'
  if (t.startsWith('ADJUSTMENT')) return 'adjustment'
  if (t.startsWith('DISPUTE')) return 'dispute'
  return 'other'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBalanceTransaction(raw: RawXenditTransaction): BalanceTransaction {
  const currency = pickCurrency(raw.currency)
  const netAmount = toMinorAmount(raw.net_amount)
  const feeAmount = raw.fee != null ? toMinorAmount(raw.fee) : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.reference_id ?? raw.id ?? ''),
    type: mapType(raw.type),
    amount: netAmount + (feeAmount ?? 0),
    currency,
    fee: feeAmount,
    net: netAmount,
    sourceId: String(raw.id ?? ''),
    sourceType: (raw.type ?? 'unknown').toLowerCase(),
    description: raw.channel_code ?? undefined,
    gateway: 'xendit',
    metadata: strMap({
      status: raw.status,
      channel_code: raw.channel_code,
      business_id: raw.business_id,
      reference_id: raw.reference_id,
    }),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
