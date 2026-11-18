/**
 * IntaSend models refunds as **chargebacks** (`/api/v1/chargebacks/`). A
 * chargeback record references the original transaction + invoice, the
 * refunded `amount`, a `reason`, and a `status`. It maps onto the canonical
 * **Refund**.
 *
 * The list/create/retrieve responses are flat (`amount`, `invoice` and
 * `transaction` are ids). The webhook chargeback event nests the full
 * `invoice` / `transaction` objects and uses a short `invoice_id` instead —
 * both shapes are handled.
 *
 * `amount` is a major-unit value (number or decimal string) and is scaled to
 * minor units. The currency lives on the nested invoice when present, else it
 * defaults via `pickCurrency`.
 *
 * Refs:
 *   refunds/card-chargebacks.md, webhooks/chargeback-events.md
 *   (IntaSend/documentation)
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

interface RawIntasendChargebackInvoice {
  invoice_id?: string
  id?: number | string
  currency?: string
  [k: string]: unknown
}

export interface RawIntasendChargeback {
  id?: number | string
  chargeback_id?: string
  transaction?: number | string | { invoice?: RawIntasendChargebackInvoice; [k: string]: unknown }
  invoice?: number | string | RawIntasendChargebackInvoice
  amount?: number | string
  reason?: string
  reason_details?: string
  status?: string
  resolution?: string | null
  staff_created?: boolean | string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * Chargeback `status` values: PENDING, CANCELLED, DISPUTED, OVERDUE,
 * COMPLETED. Only COMPLETED is a settled refund; CANCELLED maps to cancelled;
 * everything else is still in-flight (pending).
 */
function mapStatus(status: string | undefined): RefundStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded'
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
    case 'DISPUTED':
    case 'OVERDUE':
      return 'pending'
    default:
      return 'pending'
  }
}

function chargeId(raw: RawIntasendChargeback): string {
  // Webhook shape: invoice / transaction are objects with an invoice_id.
  if (raw.invoice && typeof raw.invoice === 'object') {
    return String(raw.invoice.invoice_id ?? raw.invoice.id ?? '')
  }
  if (raw.transaction && typeof raw.transaction === 'object') {
    const inv = raw.transaction.invoice
    if (inv) return String(inv.invoice_id ?? inv.id ?? '')
  }
  // Flat REST shape: invoice / transaction are ids.
  return String(raw.invoice ?? raw.transaction ?? '')
}

function currencyOf(raw: RawIntasendChargeback): string {
  const inv = typeof raw.invoice === 'object' ? raw.invoice : undefined
  const txnInv =
    typeof raw.transaction === 'object' ? raw.transaction.invoice : undefined
  return pickCurrency(inv?.currency ?? txnInv?.currency)
}

export function transformRefund(raw: RawIntasendChargeback): Refund {
  const id = String(raw.chargeback_id ?? raw.id ?? '')
  return {
    id,
    externalId: id,
    chargeId: chargeId(raw),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: currencyOf(raw),
    status: mapStatus(raw.status),
    reason: 'other',
    failureReason: undefined,
    gateway: 'intasend',
    metadata: strMap({
      reason: raw.reason,
      reason_details: raw.reason_details,
      resolution: raw.resolution,
      staff_created: raw.staff_created,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
