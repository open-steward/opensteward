/**
 * CoinPayments *invoice* → canonical {@link Charge}.
 *
 * CoinPayments is a crypto-checkout gateway: the merchant-facing primitive is an
 * **invoice** (a hosted/white-label payment request a buyer settles in crypto),
 * which is the closest canonical resource to a `Charge`. CoinPayments has no
 * card-style "charge" object, no customer object, and no refund object, so
 * `paymentMethodId` stays undefined and buyer details flow into `metadata` /
 * `receiptEmail`.
 *
 * The amount lives in `amount.total` (`{ currencyId, value, displayValue }`);
 * `value` is already integer minor units. Transforms never throw — missing
 * optionals collapse to `undefined`.
 *
 * Docs: https://docs.coinpayments.net/api/invoices/
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { resolveAmount, strMap, type CoinpaymentsAmountSlot } from './shared'

export interface RawCoinpaymentsInvoiceAmount {
  currencyId?: string | number
  breakdown?: Record<string, unknown>
  total?: CoinpaymentsAmountSlot
  [k: string]: unknown
}

export interface RawCoinpaymentsBuyer {
  companyName?: string
  emailAddress?: string
  name?: { firstName?: string; lastName?: string }
  phoneNumber?: string
  [k: string]: unknown
}

export interface RawCoinpaymentsInvoice {
  id?: string
  invoiceId?: string
  invoiceIdSuffix?: string
  status?: string
  currency?: { id?: string | number; symbol?: string }
  amount?: RawCoinpaymentsInvoiceAmount
  buyer?: RawCoinpaymentsBuyer
  description?: string
  notesToRecipient?: string
  metadata?: Record<string, unknown>
  customData?: Record<string, unknown>
  createdAt?: string
  modifiedAt?: string
  expiresAt?: string
  paidAt?: string
  completedAt?: string
  [k: string]: unknown
}

/**
 * CoinPayments invoice lifecycle → canonical charge status.
 *
 * `completed` is the terminal success state (funds credited to the merchant);
 * `paid` is confirmed-but-not-yet-credited — both map to `succeeded`. `pending`
 * (awaiting confirmations) and the pre-payment states map to `pending`;
 * `cancelled` / `timedOut` / `deleted` map to `cancelled` / `failed`.
 */
function mapStatus(status: string | undefined): ChargeStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'paid':
      return 'succeeded'
    case 'pending':
    case 'unpaid':
    case 'scheduled':
    case 'draft':
      return 'pending'
    case 'cancelled':
    case 'canceled':
    case 'deleted':
      return 'cancelled'
    case 'timedout':
    case 'timed_out':
    case 'expired':
      return 'failed'
    default:
      return 'pending'
  }
}

function buyerName(buyer: RawCoinpaymentsBuyer | undefined): string | undefined {
  if (!buyer) return undefined
  const full = [buyer.name?.firstName, buyer.name?.lastName].filter(Boolean).join(' ').trim()
  return full || buyer.companyName || undefined
}

export function transformCharge(raw: RawCoinpaymentsInvoice): Charge {
  const id = String(raw.id ?? raw.invoiceId ?? '')
  const fallbackCurrency =
    raw.currency?.symbol ?? (raw.currency?.id != null ? String(raw.currency.id) : undefined)
  const { amount, currency } = resolveAmount(raw.amount?.total, fallbackCurrency)

  return {
    id,
    externalId: String(raw.invoiceId ?? raw.id ?? ''),
    amount,
    currency,
    status: mapStatus(raw.status),
    description: raw.description ?? raw.notesToRecipient ?? undefined,
    receiptEmail: raw.buyer?.emailAddress ?? undefined,
    gateway: 'coinpayments',
    metadata: strMap({
      invoiceIdSuffix: raw.invoiceIdSuffix,
      currencySymbol: raw.currency?.symbol,
      buyerName: buyerName(raw.buyer),
      buyerCompany: raw.buyer?.companyName,
      notesToRecipient: raw.notesToRecipient,
      ...(raw.customData ?? {}),
      ...(raw.metadata ?? {}),
    }),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.completedAt ?? raw.paidAt ?? raw.modifiedAt),
    raw,
  }
}
