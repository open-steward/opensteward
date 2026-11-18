import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate, parseDecimal } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

export interface WebshipperShipmentAttributes {
  reference?: string | null
  service_code?: string | null
  status?: string | null
  tracking_number?: string | null
  tracking_links?: Array<{ url?: string | null; number?: string | null }> | null
  packages?: WebshipperPackageRaw[] | null
  delivery_address?: Record<string, unknown> | null
  sender_address?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface WebshipperPackageRaw {
  id?: string | null
  weight?: number | string | null
  weight_unit?: string | null
  length?: number | string | null
  width?: number | string | null
  height?: number | string | null
  dimension_unit?: string | null
  tracking_number?: string | null
  [key: string]: unknown
}

export interface WebshipperShipment {
  id?: string | null
  type?: string
  attributes?: WebshipperShipmentAttributes | null
  relationships?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface WebshipperShipmentResponse {
  data?: WebshipperShipment | WebshipperShipment[]
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toLowerCase()
  if (v === 'created' || v === 'pending' || v === 'label_created') return 'LABEL_CREATED'
  if (v === 'in_transit' || v === 'en_route' || v.includes('transit')) return 'IN_TRANSIT'
  if (v === 'out_for_delivery' || v.includes('out_for_delivery')) return 'OUT_FOR_DELIVERY'
  if (v === 'delivered') return 'DELIVERED'
  if (v === 'exception' || v === 'error' || v.includes('fail')) return 'EXCEPTION'
  if (v === 'returned' || v.includes('return')) return 'RETURNED'
  if (v === 'cancelled' || v === 'canceled') return 'CANCELLED'
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: WebshipperShipment): Shipment {
  const attrs = raw.attributes ?? {}

  // Prefer first tracking link URL as labelUrl proxy if no label URL in attrs
  const firstTrackingLink = attrs.tracking_links?.[0]

  // First package for weight
  const firstPkg = attrs.packages?.[0]
  const weightVal = parseDecimal(firstPkg?.weight)
  const weightUnit = (firstPkg?.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  // Packages
  const packages = (attrs.packages ?? []).map((pkg) => ({
    id: pkg.id ?? undefined,
    trackingNumber: pkg.tracking_number ?? undefined,
    weight: parseDecimal(pkg.weight) != null ? toWeight(pkg.weight, (pkg.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg') : undefined,
  }))

  return {
    id: String(raw.id ?? ''),
    status: mapShipmentStatus(attrs.status),
    trackingNumber: attrs.tracking_number ?? firstTrackingLink?.number ?? undefined,
    carrierId: 'webshipper',
    serviceCode: attrs.service_code ?? undefined,
    originAddress: toAddress(attrs.sender_address ?? null),
    destinationAddress: toAddress(attrs.delivery_address ?? null),
    totalWeight: weightVal != null ? toWeight(weightVal, weightUnit) : undefined,
    packages: packages.length > 0 ? packages : undefined,
    labelUrl: firstTrackingLink?.url ?? undefined,
    reference: attrs.reference ?? undefined,
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
