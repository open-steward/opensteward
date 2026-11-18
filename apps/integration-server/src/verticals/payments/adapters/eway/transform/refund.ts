import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { isApprovedCode, pickCurrency, splitErrors, strMap, toMinorUnits } from './shared'

/**
 * An eWAY refund response, returned by `POST /Transaction/{id}/Refund`. The
 * refund creates a NEW transaction (with its own `TransactionID`) that
 * references the original payment; the refunded amount + currency come back
 * inside a `Refund` block. Approval is reported the same way as a payment:
 * a boolean `TransactionStatus` plus the `"00"` bank `ResponseCode`.
 */
export interface RawEwayRefund {
  TransactionID?: number | string | null
  TransactionStatus?: boolean
  TransactionDateTime?: string | null
  ResponseCode?: string | null
  ResponseMessage?: string | null
  AuthorisationCode?: string | null
  Errors?: string | null
  Refund?: {
    TotalAmount?: number | string | null
    CurrencyCode?: string | null
    TransactionID?: number | string | null
    InvoiceNumber?: string | null
    InvoiceReference?: string | null
  } | null
  [k: string]: unknown
}

/**
 * @param raw       the Rapid refund response
 * @param chargeId  the original transaction id being refunded (the caller
 *                  supplies it; eWAY does not always echo it back)
 */
export function transformRefund(raw: RawEwayRefund, chargeId?: string): Refund {
  const id = String(raw.TransactionID ?? '')
  const approved = raw.TransactionStatus === true || isApprovedCode(raw.ResponseCode)
  return {
    id,
    externalId: id,
    chargeId: chargeId ?? String(raw.Refund?.TransactionID ?? ''),
    amount: toMinorUnits(raw.Refund?.TotalAmount),
    currency: pickCurrency(raw.Refund?.CurrencyCode),
    status: approved ? 'succeeded' : 'failed',
    failureReason: approved ? undefined : raw.ResponseMessage ?? undefined,
    gateway: 'eway',
    metadata: strMap({
      response_code: raw.ResponseCode,
      response_message: raw.ResponseMessage,
      authorisation_code: raw.AuthorisationCode,
      invoice_number: raw.Refund?.InvoiceNumber,
      invoice_reference: raw.Refund?.InvoiceReference,
      errors: splitErrors(raw.Errors)?.join(','),
    }),
    createdAt: toIsoDatetime(raw.TransactionDateTime),
    raw,
  }
}
