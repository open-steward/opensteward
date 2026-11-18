import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { isApprovedCode, pickCurrency, splitErrors, strMap, toMinorUnits } from './shared'

/**
 * An eWAY Rapid transaction record, returned by `POST /Transaction`,
 * `GET /Transaction/{id}` (inside the `Transactions[]` array), and the
 * refund/capture responses. Field names follow the Rapid API:
 *   - `TransactionID`        numeric transaction id
 *   - `TransactionStatus`    boolean approval flag
 *   - `TransactionType`      Purchase | MOTO | Recurring
 *   - `TransactionCaptured`  true once funds are captured (false for a held
 *                            pre-authorisation)
 *   - `ResponseCode`         two-char bank code; `"00"` = approved
 *   - `ResponseMessage`      Rapid/bank response message (e.g. `A2000`)
 *   - `AuthorisationCode`    bank authorisation code
 *   - `Errors`               comma-separated Rapid error codes on failure
 *   - `TransactionDateTime`  present on query responses (`.NET`-style date)
 *   - `Payment`              { TotalAmount (minor units), CurrencyCode,
 *                             InvoiceNumber, InvoiceReference,
 *                             InvoiceDescription }
 *   - `Customer`             { TokenCustomerID, Email, Reference, CardDetails }
 *   - `MaxRefund`            remaining refundable amount (query responses)
 */
export interface RawEwayPayment {
  TransactionID?: number | string | null
  TransactionStatus?: boolean
  TransactionType?: string
  TransactionCaptured?: boolean
  TransactionDateTime?: string | null
  ResponseCode?: string | null
  ResponseMessage?: string | null
  AuthorisationCode?: string | null
  Errors?: string | null
  BeagleScore?: number | null
  MaxRefund?: number | null
  Payment?: {
    TotalAmount?: number | string | null
    CurrencyCode?: string | null
    InvoiceNumber?: string | null
    InvoiceReference?: string | null
    InvoiceDescription?: string | null
  } | null
  Customer?: {
    TokenCustomerID?: number | string | null
    Reference?: string | null
    Email?: string | null
    CardDetails?: {
      Number?: string | null
      Name?: string | null
      CardType?: string | null
    } | null
  } | null
  [k: string]: unknown
}

function mapStatus(raw: RawEwayPayment): ChargeStatus {
  const approved = raw.TransactionStatus === true || isApprovedCode(raw.ResponseCode)
  if (!approved) return 'failed'
  // An approved-but-uncaptured pre-authorisation is still pending capture.
  if (raw.TransactionCaptured === false) return 'pending'
  return 'succeeded'
}

export function transformCharge(raw: RawEwayPayment): Charge {
  const id = String(raw.TransactionID ?? '')
  const approved = raw.TransactionStatus === true || isApprovedCode(raw.ResponseCode)
  const captured = approved && raw.TransactionCaptured !== false
  const amount = toMinorUnits(raw.Payment?.TotalAmount)
  const createdAt = toIsoDatetime(raw.TransactionDateTime)
  const tokenCustomerId = raw.Customer?.TokenCustomerID
  return {
    id,
    externalId: id,
    amount,
    currency: pickCurrency(raw.Payment?.CurrencyCode),
    amountCaptured: captured ? amount : 0,
    status: mapStatus(raw),
    captured,
    customerId:
      tokenCustomerId !== null && tokenCustomerId !== undefined && tokenCustomerId !== ''
        ? String(tokenCustomerId)
        : undefined,
    receiptEmail: raw.Customer?.Email ?? undefined,
    failureCode: approved ? undefined : raw.ResponseCode ?? undefined,
    failureMessage: approved ? undefined : raw.ResponseMessage ?? undefined,
    statementDescriptor: raw.Payment?.InvoiceReference ?? undefined,
    description: raw.Payment?.InvoiceDescription ?? undefined,
    gateway: 'eway',
    metadata: strMap({
      transaction_type: raw.TransactionType,
      response_code: raw.ResponseCode,
      response_message: raw.ResponseMessage,
      authorisation_code: raw.AuthorisationCode,
      invoice_number: raw.Payment?.InvoiceNumber,
      invoice_reference: raw.Payment?.InvoiceReference,
      card_type: raw.Customer?.CardDetails?.CardType,
      card_number: raw.Customer?.CardDetails?.Number,
      beagle_score: raw.BeagleScore,
      max_refund: raw.MaxRefund,
      errors: splitErrors(raw.Errors)?.join(','),
    }),
    createdAt,
    capturedAt: captured ? createdAt : undefined,
    raw,
  }
}
