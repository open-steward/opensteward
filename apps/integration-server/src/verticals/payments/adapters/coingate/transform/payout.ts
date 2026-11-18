/**
 * CoinGate **Send Requests** (`/v2/sends`) are the closest equivalent to the
 * canonical **Payout** resource. A merchant uses send requests to push crypto
 * to a beneficiary address; they carry a status lifecycle, amount fields, and
 * a creation timestamp — all of which map onto the canonical Payout schema.
 *
 * Amount mapping:
 *   `input_amount`   — the amount in the merchant's chosen currency (may be
 *                      the same as `balance_debit_amount` when no conversion).
 *   `sending_amount` — the amount actually sent in the recipient's currency.
 *   `balance_debit_amount` — the amount deducted from the merchant's ledger.
 *
 * We canonicalise on `balance_debit_amount` / `balance_debit_currency` (the
 * actual outflow from the merchant's account) as the payout amount, falling
 * back to `input_amount` / `input_currency` when the debit fields are absent.
 * All amounts are decimal strings in major units → converted to integer minor
 * units via `toMinorUnits`.
 *
 * Status mapping:
 *   draft / pending_2fa / new     → pending
 *   in_progress / processing      → in_transit
 *   completed                     → paid
 *   failed / expired              → failed
 *   canceled / cancelled          → cancelled
 *
 * Refs:
 *   https://developer.coingate.com/reference/send-request-overview
 *   https://coingate.com/blog/post/how-to-automate-crypto-payouts-via-api
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/** Currency object embedded in CoinGate send request amount fields. */
interface RawCoingateSendCurrency {
  id?: number | string
  title?: string
  symbol?: string
  [k: string]: unknown
}

export interface RawCoingateSend {
  id?: number | string
  status?: string
  purpose?: string
  callback_url?: string
  external_id?: string
  input_amount?: string | number
  input_currency?: RawCoingateSendCurrency | string
  sending_amount?: string | number
  sending_currency?: RawCoingateSendCurrency | string
  input_to_sending_rate?: string
  balance_debit_amount?: string | number
  balance_debit_currency?: RawCoingateSendCurrency | string
  sending_to_balance_debit_rate?: string
  ledger_account?: Record<string, unknown>
  beneficiary_payout_setting?: Record<string, unknown>
  fees?: Record<string, unknown>
  blockchain_transactions?: unknown[]
  requires_2fa_confirmation?: boolean
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function extractCurrencySymbol(
  v: RawCoingateSendCurrency | string | null | undefined,
): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v.toUpperCase()
  return typeof v.symbol === 'string' ? v.symbol.toUpperCase() : undefined
}

function mapStatus(raw: RawCoingateSend): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
      return 'paid'
    case 'in_progress':
    case 'processing':
      return 'in_transit'
    case 'failed':
    case 'expired':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'draft':
    case 'pending_2fa':
    case 'new':
    case 'pending':
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawCoingateSend): Payout {
  // Prefer balance_debit_* (actual ledger outflow); fall back to input_*
  const amountStr = raw.balance_debit_amount ?? raw.input_amount
  const currencySymbol =
    extractCurrencySymbol(raw.balance_debit_currency) ??
    extractCurrencySymbol(raw.input_currency)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(amountStr),
    currency: pickCurrency(currencySymbol),
    status: mapStatus(raw),
    gateway: 'coingate',
    metadata: strMap({
      external_id: raw.external_id,
      purpose: raw.purpose,
      input_amount: raw.input_amount,
      input_currency:
        typeof raw.input_currency === 'object'
          ? raw.input_currency?.symbol
          : raw.input_currency,
      sending_amount: raw.sending_amount,
      sending_currency:
        typeof raw.sending_currency === 'object'
          ? raw.sending_currency?.symbol
          : raw.sending_currency,
      balance_debit_amount: raw.balance_debit_amount,
      balance_debit_currency:
        typeof raw.balance_debit_currency === 'object'
          ? raw.balance_debit_currency?.symbol
          : raw.balance_debit_currency,
      input_to_sending_rate: raw.input_to_sending_rate,
      sending_to_balance_debit_rate: raw.sending_to_balance_debit_rate,
      requires_2fa_confirmation: raw.requires_2fa_confirmation,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.created_at),
    raw,
  }
}
