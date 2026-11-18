/**
 * Helcim card transaction ↔ canonical Charge.
 *
 * The read model is `GET /card-transactions`; the write model is
 * `POST /payment/purchase`. Both return the same transaction shape. Helcim
 * reports `amount` as decimal dollars, so we convert to integer minor units.
 *
 * `status` is `APPROVED` | `DECLINED`; `type` is `purchase` | `preauth` |
 * `verify` (a `preauth` is an authorisation that has not been captured). The
 * card number ships in F6L4 form (first-6/last-4) — never the full PAN.
 *
 * `dateCreated` is `YYYY-MM-DD HH:MM:SS` (Mountain Time); `toIsoDatetime`
 * normalises the space separator to strict ISO-8601.
 *
 * Refs:
 *   https://devdocs.helcim.com/reference/getcardtransactions
 *   https://devdocs.helcim.com/reference/getcardtransaction
 *   https://devdocs.helcim.com/reference/purchase
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawHelcimTransaction {
  transactionId?: number | string
  cardBatchId?: number | string
  dateCreated?: string
  status?: string
  user?: string
  type?: string
  amount?: number | string
  currency?: string
  avsResponse?: string
  cvvResponse?: string
  approvalCode?: string
  cardToken?: string
  cardNumber?: string
  cardType?: string
  cardHolderName?: string
  customerCode?: string
  invoiceNumber?: string
  warning?: string
  [k: string]: unknown
}

function mapStatus(raw: RawHelcimTransaction): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawHelcimTransaction): Charge {
  // A `purchase` is captured at authorisation; a `preauth` is not.
  const captured = (raw.type ?? '').toLowerCase() === 'purchase'
  return {
    id: String(raw.transactionId ?? ''),
    externalId: String(raw.transactionId ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    captured,
    customerId: raw.customerCode || undefined,
    paymentMethodId: raw.cardToken || undefined,
    invoiceId: raw.invoiceNumber || undefined,
    statementDescriptor: raw.cardHolderName || undefined,
    failureMessage: (raw.status ?? '').toUpperCase() === 'DECLINED' ? raw.warning : undefined,
    gateway: 'helcim',
    metadata: strMap({
      type: raw.type,
      approvalCode: raw.approvalCode,
      cardType: raw.cardType,
      cardNumber: raw.cardNumber,
      cardBatchId: raw.cardBatchId,
      avsResponse: raw.avsResponse,
      cvvResponse: raw.cvvResponse,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    raw,
  }
}
