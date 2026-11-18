import { majorToMinor } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { createdIso, metadataMap, present, required, type RawKushkiTransaction } from './shared'

export type RawKushkiRefund = RawKushkiTransaction

/** `transaction_status` enum: APPROVED, DECLINED, INITIALIZED. */
function mapRefundStatus(s: string | undefined): RefundStatus {
  switch (s) {
    case 'APPROVED':
    case 'APPROVAL':
      return 'succeeded'
    case 'DECLINED':
      return 'failed'
    case 'INITIALIZED':
      return 'pending'
    default:
      return 'unknown'
  }
}

/**
 * A `transaction_type=REFUND` row of the transactions list. `sale_ticket_number`
 * ("Displays the number of the sales receipt that was generated for the
 * transaction") is the refunded sale's `ticket_number`, which is the charge id.
 * `request_amount` "Displays the total amount the customer requested to return
 * (card)".
 */
export function transformRefund(raw: RawKushkiRefund): Refund {
  const id = required(present(raw.ticket_number), 'ticket_number', 'refund')
  const chargeId = required(present(raw.sale_ticket_number), 'sale_ticket_number', `refund ${id}`)
  const currency = required(present(raw.currency_code), 'currency_code', `refund ${id}`)
  const amount = majorToMinor(
    typeof raw.request_amount === 'number' ? raw.request_amount : undefined,
    currency,
  )
  if (amount === undefined) throw new Error(`Kushki refund ${id} has no request_amount`)
  const status = mapRefundStatus(present(raw.transaction_status))
  return {
    id,
    externalId: id,
    chargeId,
    amount,
    currency,
    status,
    failureReason: status === 'failed' ? present(raw.response_text) : undefined,
    gateway: 'kushki',
    metadata: metadataMap(raw.metadata),
    createdAt: createdIso(raw.created),
    raw,
  }
}
