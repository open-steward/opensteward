import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toIso2c2p, toMinorUnits } from './shared'

/**
 * Decoded claims of a 2C2P Payment Inquiry response (and the backend
 * notification, which shares the same shape). 2C2P has no "list payments"
 * endpoint and no standalone customer/refund resource in this REST model, so a
 * transaction is the only charge-shaped object — keyed by the merchant
 * `invoiceNo`.
 *
 * Docs: https://developer.2c2p.com/docs/api-payment-inquiry-response-parameter
 */
export interface RawTwoC2PTransaction {
  merchantID?: string
  invoiceNo?: string
  amount?: number | string
  currencyCode?: string
  transactionDateTime?: string
  agentCode?: string
  channelCode?: string
  approvalCode?: string
  referenceNo?: string
  tranRef?: string
  accountNo?: string
  customerToken?: string
  recurringUniqueID?: string
  eci?: string
  schemePaymentID?: string
  idempotencyID?: string
  paymentScheme?: string
  respCode?: string
  respDesc?: string
  [k: string]: unknown
}

/**
 * Map a 2C2P response code to the canonical charge status.
 *  - `0000` — success / settled.
 *  - `0001` — transaction is pending / in progress.
 *  - `2xxx` — rejected / declined by the issuer or risk rules.
 *  - `4xxx` — cancelled / voided / reversed.
 * Anything unrecognised falls back to `pending` (never throws).
 */
export function mapStatus(respCode: string | undefined): ChargeStatus {
  const code = (respCode ?? '').trim()
  if (code === '0000') return 'succeeded'
  if (code === '0001') return 'pending'
  if (code.startsWith('4')) return 'cancelled'
  if (code.startsWith('2') || code.startsWith('3')) return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawTwoC2PTransaction): Charge {
  const id = String(raw.invoiceNo ?? raw.tranRef ?? raw.referenceNo ?? '')
  const status = mapStatus(raw.respCode)
  const failed = status === 'failed' || status === 'cancelled'
  const when = toIso2c2p(raw.transactionDateTime)

  return {
    id,
    externalId: String(raw.tranRef ?? raw.invoiceNo ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currencyCode),
    status,
    captured: status === 'succeeded' ? true : undefined,
    capturedAt: status === 'succeeded' ? when : undefined,
    failureCode: failed && raw.respCode ? raw.respCode : undefined,
    failureMessage: failed ? raw.respDesc : undefined,
    gateway: '2c2p',
    metadata: strMap({
      invoiceNo: raw.invoiceNo,
      tranRef: raw.tranRef,
      referenceNo: raw.referenceNo,
      approvalCode: raw.approvalCode,
      agentCode: raw.agentCode,
      channelCode: raw.channelCode,
      accountNo: raw.accountNo,
      customerToken: raw.customerToken,
      recurringUniqueID: raw.recurringUniqueID,
      eci: raw.eci,
      schemePaymentID: raw.schemePaymentID,
      idempotencyID: raw.idempotencyID,
      paymentScheme: raw.paymentScheme,
      respCode: raw.respCode,
      respDesc: raw.respDesc,
    }),
    createdAt: when,
    updatedAt: when,
    raw,
  }
}
