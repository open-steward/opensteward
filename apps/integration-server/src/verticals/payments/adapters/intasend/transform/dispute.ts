/**
 * IntaSend disputes — derived from chargebacks (`/api/v1/chargebacks/`).
 *
 * IntaSend's chargeback resource carries dispute lifecycle state:
 * PENDING, DISPUTED, OVERDUE, COMPLETED, CANCELLED. This overlaps with the
 * canonical Dispute concept (needs_response → under_review → won/lost) even
 * though the same endpoint is already used for canonical Refunds. The dispute
 * view surfaces the chargeback as a dispute record so integrators can track
 * the resolution process.
 *
 * Field mapping:
 *   chargeback_id / id  → id / externalId
 *   invoice (id)        → chargeId
 *   amount              → amount (major units → minor units)
 *   currency (from invoice if present) → currency
 *   status              → status
 *   reason              → reason
 *
 * Status mapping:
 *   PENDING              → needs_response
 *   DISPUTED             → under_review
 *   OVERDUE              → needs_response
 *   COMPLETED            → won
 *   CANCELLED            → charge_refunded
 *
 * Refs:
 *   https://developers.intasend.com/reference/api_v1_chargebacks_list
 *   refunds/card-chargebacks.md (IntaSend/documentation)
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { RawIntasendChargeback } from './refund'

function mapStatus(status: string | undefined): DisputeStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PENDING':
    case 'OVERDUE':
      return 'needs_response'
    case 'DISPUTED':
      return 'under_review'
    case 'COMPLETED':
      return 'won'
    case 'CANCELLED':
      return 'charge_refunded'
    default:
      return 'needs_response'
  }
}

function mapReason(reason: string | undefined): DisputeReason | undefined {
  if (!reason) return undefined
  const r = reason.toLowerCase()
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('cancel')) return 'subscription_cancelled'
  if (r.includes('not received') || r.includes('not deliver')) return 'product_not_received'
  if (r.includes('unaccept') || r.includes('defect')) return 'product_unacceptable'
  return 'general'
}

function chargeId(raw: RawIntasendChargeback): string {
  if (raw.invoice && typeof raw.invoice === 'object') {
    return String(raw.invoice.invoice_id ?? raw.invoice.id ?? '')
  }
  if (raw.transaction && typeof raw.transaction === 'object') {
    const inv = raw.transaction.invoice
    if (inv) return String(inv.invoice_id ?? inv.id ?? '')
  }
  return String(raw.invoice ?? raw.transaction ?? '')
}

function currencyOf(raw: RawIntasendChargeback): string {
  const inv = typeof raw.invoice === 'object' ? raw.invoice : undefined
  const txnInv =
    typeof raw.transaction === 'object' ? raw.transaction.invoice : undefined
  return pickCurrency(inv?.currency ?? txnInv?.currency)
}

export function transformDispute(raw: RawIntasendChargeback): Dispute {
  const id = String(raw.chargeback_id ?? raw.id ?? '')

  return {
    id,
    externalId: id,
    chargeId: chargeId(raw),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: currencyOf(raw),
    status: mapStatus(raw.status),
    reason: mapReason(raw.reason),
    evidenceDueBy: undefined,
    network: undefined,
    gateway: 'intasend',
    metadata: strMap({
      reason: raw.reason,
      reason_details: raw.reason_details,
      resolution: raw.resolution,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
