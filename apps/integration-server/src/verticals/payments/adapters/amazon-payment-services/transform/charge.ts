import type { Charge, ChargeStatus } from '../../../schema/charge'
import { isSuccessCode, pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * An APS charge is the response of a PURCHASE / AUTHORIZATION command, or the
 * payload of a CHECK_STATUS query. All three share the same core shape: a
 * `fort_id` (APS transaction id), the merchant's `merchant_reference`, the
 * `command`, a `status` (2-digit transaction status), a `response_code`
 * (`<status><message>`), and the original `amount` / `currency`.
 *
 * Transaction status codes:
 *   02 = Authorization Success     04 = Capture Success
 *   08 = Authorization Voided      14 = Purchase Success
 *   (anything else with a non-`000` response message is treated as failed.)
 */
export interface RawApsCharge {
  fort_id?: string
  merchant_reference?: string
  command?: string
  service_command?: string
  status?: string
  response_code?: string
  response_message?: string
  amount?: string | number
  authorized_amount?: string | number
  captured_amount?: string | number
  currency?: string
  customer_email?: string
  customer_name?: string
  customer_ip?: string
  payment_option?: string
  card_number?: string
  expiry_date?: string
  eci?: string
  authorization_code?: string
  transaction_status?: string
  transaction_code?: string
  transaction_message?: string
  [k: string]: unknown
}

/** APS transaction status code → canonical charge status. */
function mapStatus(raw: RawApsCharge): ChargeStatus {
  const status = String(raw.status ?? raw.transaction_status ?? '')
  switch (status) {
    case '02': // authorization success
    case '14': // purchase success
    case '04': // capture success
      return 'succeeded'
    case '08': // authorization voided
      return 'cancelled'
    case '06': // refund success (only reached if a refund object is read as a charge)
      return 'refunded'
    default:
      // Pending intermediate states carry a `000`/in-progress message;
      // anything with a non-success response code is a failure.
      if (isSuccessCode(raw.response_code)) return 'succeeded'
      if (raw.response_code) return 'failed'
      return 'pending'
  }
}

export function transformCharge(raw: RawApsCharge): Charge {
  const status = mapStatus(raw)
  const isCapture = String(raw.status ?? '') === '14' || String(raw.status ?? '') === '04'
  return {
    id: String(raw.fort_id ?? raw.merchant_reference ?? ''),
    externalId: String(raw.fort_id ?? raw.merchant_reference ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    amountCaptured:
      raw.captured_amount != null ? toMinorUnits(raw.captured_amount) : undefined,
    status,
    captured: isCapture ? true : undefined,
    failureCode:
      status === 'failed' && raw.response_code ? String(raw.response_code) : undefined,
    failureMessage:
      status === 'failed'
        ? (raw.transaction_message ?? raw.response_message ?? undefined)
        : undefined,
    receiptEmail: raw.customer_email ?? undefined,
    gateway: 'amazon-payment-services',
    metadata: strMap({
      merchant_reference: raw.merchant_reference,
      command: raw.command ?? raw.service_command,
      response_code: raw.response_code,
      response_message: raw.response_message,
      payment_option: raw.payment_option,
      authorization_code: raw.authorization_code,
      transaction_code: raw.transaction_code,
      eci: raw.eci,
    }),
    raw,
  }
}
