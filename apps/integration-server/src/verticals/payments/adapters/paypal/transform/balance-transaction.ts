/**
 * PayPal Reporting Transactions API → canonical BalanceTransaction.
 *
 * The Reporting Transactions endpoint (`/v1/reporting/transactions`) surfaces
 * ledger entries for a PayPal account — charges, refunds, payouts, fees, etc.
 * Money is returned as a decimal string with a `currency_code` (e.g.
 * `{ "value": "-1.50", "currency_code": "USD" }`); we convert to integer
 * minor units as required by the canonical schema.
 *
 * transaction_event_code prefixes:
 *   T0001-T0099  charge/sale
 *   T1100-T1199  refund
 *   T0200-T0299  payout
 *   T0700-T0799  dispute
 *   T1500-T1599  adjustment/correction
 *   T0400-T0499  fee
 *
 * Docs: https://developer.paypal.com/docs/api/transaction-search/v1/
 */

import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalTransactionAmount {
  currency_code?: string | null
  value?: string | null
}

export interface RawPayPalReportingTransaction {
  transaction_id?: string | null
  transaction_event_code?: string | null
  transaction_status?: string | null
  transaction_amount?: RawPayPalTransactionAmount | null
  fee_amount?: RawPayPalTransactionAmount | null
  transaction_initiation_date?: string | null
  transaction_updated_date?: string | null
  paypal_account_id?: string | null
  transaction_note?: string | null
  invoice_id?: string | null
  custom_field?: string | null
  [k: string]: unknown
}

/** Map a PayPal transaction_event_code prefix to the canonical type. */
function mapType(code: string | null | undefined): BalanceTransactionType {
  const c = (code ?? '').toUpperCase()
  // T0001–T0099 → charge/sale
  if (/^T00[0-9][0-9]$/.test(c)) return 'charge'
  // T1100–T1199 → refund
  if (/^T11/.test(c)) return 'refund'
  // T0200–T0299 → payout/withdrawal
  if (/^T02/.test(c)) return 'payout'
  // T0700–T0799 → dispute/chargeback
  if (/^T07/.test(c)) return 'dispute'
  // T0400–T0499 → fee
  if (/^T04/.test(c)) return 'fee'
  // T1500–T1599 → adjustment
  if (/^T15/.test(c)) return 'adjustment'
  // T0300 → transfer
  if (/^T03/.test(c)) return 'transfer'
  return 'other'
}

export function transformBalanceTransaction(
  raw: RawPayPalReportingTransaction,
): BalanceTransaction {
  const id = String(raw.transaction_id ?? '')
  const currency = pickCurrency(raw.transaction_amount?.currency_code)
  const gross = decimalToMinor(raw.transaction_amount?.value)
  const feeMinor = raw.fee_amount?.value
    ? decimalToMinor(raw.fee_amount.value)
    : undefined
  const net =
    gross !== undefined && feeMinor !== undefined ? gross + feeMinor : undefined

  return {
    id,
    externalId: id,
    type: mapType(raw.transaction_event_code),
    amount: gross,
    currency,
    fee: feeMinor !== undefined ? Math.abs(feeMinor) : undefined,
    net,
    description: raw.transaction_note ?? raw.invoice_id ?? undefined,
    gateway: 'paypal',
    metadata: strMap({
      transaction_event_code: raw.transaction_event_code,
      transaction_status: raw.transaction_status,
      paypal_account_id: raw.paypal_account_id,
      invoice_id: raw.invoice_id,
      custom_field: raw.custom_field,
    }),
    createdAt: raw.transaction_initiation_date ?? undefined,
    raw,
  }
}
