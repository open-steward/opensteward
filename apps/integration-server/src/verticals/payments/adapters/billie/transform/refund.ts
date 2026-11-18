import type { Refund } from '../../../schema/refund'
import { grossMinor, pickCurrency, strMap, type TaxedMoney } from './shared'

/**
 * A Billie "credit note" reduces the amount owed on a capture (invoice) and is
 * the closest analogue to a canonical Refund. It is created against a capture
 * id (`POST /invoices/{captureId}/credit-notes`); the create call returns only
 * the new credit-note `uuid`, so the chargeId/amount are carried from the
 * request when surfacing the canonical Refund.
 *
 * Docs: https://docs.billie.io/reference/create_credit_note
 */
export interface RawBillieCreditNote {
  uuid?: string
  external_code?: string | null
  amount?: TaxedMoney | null
  comment?: string | null
  /** Synthesised by the adapter from the create request — not part of the API
   *  response body, which only contains `uuid`. */
  capture_id?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawBillieCreditNote): Refund {
  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.external_code ?? raw.uuid ?? ''),
    chargeId: String(raw.capture_id ?? ''),
    amount: grossMinor(raw.amount),
    currency: pickCurrency(null),
    status: 'succeeded',
    gateway: 'billie',
    metadata: strMap({ comment: raw.comment, external_code: raw.external_code }),
    raw,
  }
}
