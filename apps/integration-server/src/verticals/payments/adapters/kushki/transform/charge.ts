import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { createdIso, metadataMap, present, required, type RawKushkiTransaction } from './shared'

export type RawKushkiCharge = RawKushkiTransaction

/** `transaction_status` enum: APPROVED, DECLINED, INITIALIZED (the Analytics overview's example also shows `APPROVAL`). */
export function mapChargeStatus(s: string | undefined): ChargeStatus {
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
 * A `transaction_type=SALE` row of the transactions list. The id is
 * `ticket_number`, the number the void and refund endpoints take ("Refund a
 * transaction identified by its `ticketNumber`") and the one a refund row
 * names in `sale_ticket_number`.
 *
 * `amount` is `request_amount` (number): "Displays the total amount the
 * customer requested to return (card) or the amount of the transaction (cash
 * or transfer)", and equal to the sale amount in every SALE example. The field
 * named for SALE, `total_amount` ("For the `SALE` case, shows the amount the
 * customer requested to collect"), is typed string and its examples are `''`,
 * so it is not read. `amountCaptured` is `approved_transaction_amount`.
 */
export function transformCharge(raw: RawKushkiCharge): Charge {
  const id = required(present(raw.ticket_number), 'ticket_number', 'charge')
  const currency = required(present(raw.currency_code), 'currency_code', `charge ${id}`)
  const amount = majorToMinor(
    typeof raw.request_amount === 'number' ? raw.request_amount : undefined,
    currency,
  )
  if (amount === undefined) throw new Error(`Kushki charge ${id} has no request_amount`)
  const status = mapChargeStatus(present(raw.transaction_status))
  const failed = status === 'failed'
  return {
    id,
    externalId: id,
    amount,
    currency,
    amountCaptured: majorToMinor(
      typeof raw.approved_transaction_amount === 'number'
        ? raw.approved_transaction_amount
        : undefined,
      currency,
    ),
    status,
    subscriptionId: present(raw.subscription_id),
    description: present(raw.payment_description),
    failureCode: failed ? present(raw.response_code) : undefined,
    failureMessage: failed ? present(raw.response_text) : undefined,
    gateway: 'kushki',
    metadata: metadataMap(raw.metadata),
    createdAt: createdIso(raw.created),
    raw,
  }
}
