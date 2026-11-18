/**
 * Crossmint Order → canonical Charge.
 *
 * Crossmint's checkout is order-centric: an **Order** carries the amount,
 * currency, payment method/status, recipient, and the quote → payment →
 * delivery lifecycle, so it maps onto the canonical **Charge**. There is no
 * separate customer object — the buyer is identified by the order's recipient
 * (an email and/or a destination wallet address).
 *
 * Money lives in `quote.totalPrice` as a decimal MAJOR-unit string, converted
 * to integer minor units here. Canonical status is derived from the order's
 * `payment.status` (quote/delivery statuses are folded in as metadata).
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits, type CrossmintMoney } from './shared'

export interface RawCrossmintLineItem {
  chain?: string
  quantity?: number
  metadata?: { name?: string; description?: string; imageUrl?: string }
  quote?: { totalPrice?: CrossmintMoney }
  delivery?: {
    status?: string
    recipient?: { locator?: string; email?: string; walletAddress?: string }
    txId?: string
  }
  [k: string]: unknown
}

export interface RawCrossmintOrder {
  orderId?: string
  phase?: string
  locale?: string
  lineItems?: RawCrossmintLineItem[]
  quote?: {
    status?: string
    quotedAt?: string
    expiresAt?: string
    totalPrice?: CrossmintMoney
  }
  payment?: {
    status?: string
    method?: string
    currency?: string
    failureReason?: string
    receiptEmail?: string
    preparation?: { chain?: string; payerAddress?: string }
  }
  recipient?: { email?: string; walletAddress?: string }
  createdAt?: string
  [k: string]: unknown
}

/** Map a Crossmint payment status onto the canonical charge status. */
function mapStatus(status: string | undefined): ChargeStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
      return 'succeeded'
    case 'failed':
    case 'failed-kyc':
      return 'failed'
    case 'awaiting-payment':
    case 'in-progress':
    case 'requires-kyc':
    case 'manual-kyc':
    case 'requires-recipient':
    case 'requires-crypto-payer-address':
      return 'pending'
    default:
      return 'pending'
  }
}

/** First line item's delivery recipient, falling back to the order recipient. */
function firstRecipient(raw: RawCrossmintOrder): { email?: string; walletAddress?: string } {
  const fromLine = raw.lineItems?.[0]?.delivery?.recipient
  return {
    email: fromLine?.email ?? raw.recipient?.email,
    walletAddress: fromLine?.walletAddress ?? raw.recipient?.walletAddress,
  }
}

export function transformCharge(raw: RawCrossmintOrder): Charge {
  const total = raw.quote?.totalPrice
  const recipient = firstRecipient(raw)
  const firstLine = raw.lineItems?.[0]
  return {
    id: String(raw.orderId ?? ''),
    externalId: String(raw.orderId ?? ''),
    amount: toMinorUnits(total?.amount) ?? 0,
    currency: pickCurrency(total?.currency ?? raw.payment?.currency),
    status: mapStatus(raw.payment?.status),
    description: firstLine?.metadata?.name,
    failureMessage: raw.payment?.failureReason,
    receiptEmail: raw.payment?.receiptEmail ?? recipient.email,
    gateway: 'crossmint',
    metadata: strMap({
      phase: raw.phase,
      locale: raw.locale,
      paymentMethod: raw.payment?.method,
      paymentStatus: raw.payment?.status,
      quoteStatus: raw.quote?.status,
      deliveryStatus: firstLine?.delivery?.status,
      chain: firstLine?.chain ?? raw.payment?.preparation?.chain,
      payerAddress: raw.payment?.preparation?.payerAddress,
      recipientWalletAddress: recipient.walletAddress,
      deliveryTxId: firstLine?.delivery?.txId,
    }),
    createdAt: toIsoDatetime(raw.createdAt ?? raw.quote?.quotedAt),
    raw,
  }
}
