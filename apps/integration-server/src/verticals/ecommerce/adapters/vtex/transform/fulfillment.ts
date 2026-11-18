/**
 * VTEX package/invoice → canonical Fulfillment.
 *
 * In VTEX, a fulfillment corresponds to an `invoicedPackage` (or `packageAttachment`)
 * on an order. The invoicing action creates a dispatch record with carrier
 * and tracking information. We treat each invoiced package as a Fulfillment.
 *
 * VTEX endpoints:
 *   GET /api/oms/pvt/orders/{orderId}  — returns order with packageAttachment.packages[]
 *   POST /api/oms/pvt/orders/{orderId}/invoice — creates an invoice (fulfills items)
 *
 * Docs: https://developers.vtex.com/vtex-rest-api/reference/invoice
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw VTEX package shape ────────────────────────────────────────────────────

export interface RawVtexPackageItem {
  itemIndex?: number
  quantity?: number
  price?: number
  unitMultiplier?: number
  [key: string]: unknown
}

export interface RawVtexPackage {
  invoiceNumber?: string
  invoiceValue?: number
  invoiceUrl?: string | null
  issuanceDate?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  courierStatus?: {
    status?: string | null
    finished?: boolean
    data?: Array<{ lastChange?: string | null; description?: string | null }>
  } | null
  cfop?: string | null
  type?: string | null                   // 'Output' | 'Input' (invoice type)
  courier?: string | null
  warehouseId?: string | null
  items?: RawVtexPackageItem[]
  embeddedInvoice?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(pkg: RawVtexPackage): FulfillmentStatus | undefined {
  const status = pkg.courierStatus?.status?.toUpperCase()
  const finished = pkg.courierStatus?.finished

  if (finished) return 'SUCCESS'
  if (status) {
    if (status.includes('CANCEL')) return 'CANCELLED'
    if (status.includes('ERROR') || status.includes('FAIL')) return 'ERROR'
    if (status.includes('DELIVER') || status.includes('RECEIV')) return 'SUCCESS'
    return 'OPEN'
  }
  // If there is an invoice number but no courier status, the package was invoiced
  // but not yet dispatched.
  if (pkg.invoiceNumber) return 'OPEN'
  return 'PENDING'
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapLineItems(
  items: RawVtexPackageItem[] | undefined,
): Array<{ lineItemId: string; quantity: number }> | undefined {
  if (!items || items.length === 0) return undefined
  return items
    .filter((it) => it.itemIndex != null)
    .map((it) => ({
      lineItemId: String(it.itemIndex),
      quantity: it.quantity ?? 1,
    }))
}

// ── Main transform ────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawVtexPackage, orderId: string): Fulfillment {
  const id = raw.invoiceNumber
    ? `${orderId}:${raw.invoiceNumber}`
    : `${orderId}:${raw.trackingNumber ?? 'unknown'}`

  return {
    id,
    orderId,
    status: mapStatus(raw),
    trackingNumber: raw.trackingNumber ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    carrier: raw.courier ?? undefined,
    locationId: raw.warehouseId ?? undefined,
    lineItems: mapLineItems(raw.items),
    shippedAt: raw.issuanceDate ?? undefined,
    createdAt: raw.issuanceDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → VTEX invoice body for POST /api/oms/pvt/orders/{id}/invoice */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    type: 'Output',
    invoiceNumber: fulfillment.id?.split(':')[1] ?? undefined,
    courier: fulfillment.carrier,
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    items: (fulfillment.lineItems ?? []).map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
    issuanceDate: fulfillment.shippedAt ?? new Date().toISOString(),
  }
}
