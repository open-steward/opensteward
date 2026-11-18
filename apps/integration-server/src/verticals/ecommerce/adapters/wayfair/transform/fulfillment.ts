/**
 * Wayfair Shipment Registration → canonical Fulfillment.
 *
 * When a supplier ships a dropship order to the end customer they register
 * the shipment via the `registerOrder` GraphQL mutation. The mutation response
 * includes a `handle` (async job identifier) and a `submittedAt` timestamp.
 *
 * Wayfair does not expose a dedicated GET fulfillment endpoint — fulfilled
 * orders can be checked via `getDropshipPurchaseOrders` with the appropriate
 * filter. We surface what the registration response provides.
 *
 * Raw mutation response fields (from `registerOrder` / `sendASN`):
 *   handle      — unique submission ID for this registration job
 *   submittedAt — ISO-8601 when Wayfair received the registration
 *   errors[]    — { key, message }
 *
 * We supplement with caller-provided data (poNumber, trackingNumber, carrier).
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWayfairRegistrationError {
  key?: string | null
  message?: string | null
}

export interface RawWayfairShipmentRegistration {
  /** Async job handle returned by the registerOrder mutation. */
  handle?: string | null
  submittedAt?: string | null
  errors?: RawWayfairRegistrationError[] | null
  /** Populated by adapter from the request context. */
  poNumber?: string | null
  trackingNumber?: string | null
  carrierCode?: string | null
  warehouseId?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

function deriveStatus(raw: RawWayfairShipmentRegistration): FulfillmentStatus | undefined {
  if (raw.errors && raw.errors.length > 0) return 'ERROR'
  if (raw.handle) return 'SUCCESS'
  return undefined
}

export function transformFulfillment(raw: RawWayfairShipmentRegistration): Fulfillment {
  // Use handle as primary id; fall back to a synthetic id from poNumber.
  const id = raw.handle ?? `wf-${raw.poNumber ?? 'unknown'}`

  return {
    id,
    orderId: raw.poNumber ?? id,
    status: deriveStatus(raw),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrier: raw.carrierCode ?? undefined,
    locationId: raw.warehouseId ?? undefined,
    createdAt: toIsoDatetime(raw.submittedAt),
    updatedAt: toIsoDatetime(raw.submittedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Fulfillment → Wayfair registerOrder mutation input variables.
 *
 * The caller must supply at minimum:
 *   orderId         — poNumber
 *   trackingNumber  — carrier tracking number
 *   carrier         — Wayfair carrier code (e.g. "UPS", "FEDEX")
 *   locationId      — warehouseId
 */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    poNumber: fulfillment.orderId,
    warehouseId: fulfillment.locationId,
    trackingNumber: fulfillment.trackingNumber,
    carrierCode: fulfillment.carrier,
    // The shipping method / ship speed comes from the original PO; not set here.
  }
}
