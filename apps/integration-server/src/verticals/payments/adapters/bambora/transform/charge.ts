import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { isApproved, pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A Bambora payment / transaction record, returned by `POST /payments`,
 * `GET /payments/{id}`, the void/return/completion endpoints, and the
 * reporting search. Field names follow the Bambora NA Payment APIs:
 *   - `id`             transaction id (number on payment responses; `trn_id`
 *                      in the reporting search records)
 *   - `approved`       "1" / "0"
 *   - `type`           P (purchase) | PA (pre-auth) | PAC (completion) |
 *                      R (return) | VP / VR (void)
 *   - `amount`         major-unit decimal (e.g. "10.00")
 *   - `payment_method` "card" | "cash" | "cheque" | "token" | …
 *   - `card`           { card_type, last_four }
 *   - `custom`         { ref1..ref5 } merchant-supplied passthrough
 */
export interface RawBamboraPayment {
  id?: number | string
  trn_id?: number | string
  approved?: number | string
  message_id?: number | string
  message?: string
  auth_code?: string
  created?: string
  order_number?: string
  type?: string
  amount?: number | string
  currency?: string
  payment_method?: string
  card?: {
    card_type?: string
    last_four?: string
    address_match?: number | string
  }
  custom?: {
    ref1?: string
    ref2?: string
    ref3?: string
    ref4?: string
    ref5?: string
  }
  [k: string]: unknown
}

function mapStatus(raw: RawBamboraPayment): ChargeStatus {
  const type = (raw.type ?? '').toUpperCase()
  // Void records report the reversal of the original transaction.
  if (type === 'VP' || type === 'VR' || type === 'V') return 'cancelled'
  // Return / refund records.
  if (type === 'R') return 'refunded'
  if (!isApproved(raw.approved)) return 'failed'
  // Pre-auths are authorised but not yet captured.
  if (type === 'PA') return 'pending'
  return 'succeeded'
}

export function transformCharge(raw: RawBamboraPayment): Charge {
  const id = String(raw.id ?? raw.trn_id ?? '')
  const approved = isApproved(raw.approved)
  const type = (raw.type ?? '').toUpperCase()
  const captured = approved && type !== 'PA'
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    amountCaptured: captured ? toMinorUnits(raw.amount) : 0,
    status: mapStatus(raw),
    captured,
    paymentMethodId: raw.card?.last_four ? `card_${raw.card.last_four}` : undefined,
    statementDescriptor: raw.order_number,
    failureCode:
      approved || raw.message_id == null ? undefined : String(raw.message_id),
    failureMessage: approved ? undefined : raw.message,
    gateway: 'bambora',
    metadata: strMap({
      order_number: raw.order_number,
      auth_code: raw.auth_code,
      type: raw.type,
      payment_method: raw.payment_method,
      card_type: raw.card?.card_type,
      last_four: raw.card?.last_four,
      message_id: raw.message_id,
      message: raw.message,
      ref1: raw.custom?.ref1,
      ref2: raw.custom?.ref2,
      ref3: raw.custom?.ref3,
      ref4: raw.custom?.ref4,
      ref5: raw.custom?.ref5,
    }),
    createdAt: toIsoDatetime(raw.created),
    capturedAt: captured ? toIsoDatetime(raw.created) : undefined,
    raw,
  }
}
