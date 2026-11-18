import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── PostNL raw types ───────────────────────────────────────────────────────

export interface PostNLLabelResponse {
  MergedLabels: PostNLMergedLabel[] | null
  ResponseShipments: PostNLResponseShipment[] | null
  [key: string]: unknown
}

export interface PostNLMergedLabel {
  Barcode: string
  Labels: PostNLLabel[]
  [key: string]: unknown
}

export interface PostNLLabel {
  Content: string
  Labeltype: string
  OutputType: string
  [key: string]: unknown
}

export interface PostNLResponseShipment {
  Barcode: string
  Errors: unknown[] | null
  Warnings: unknown[] | null
  Labels: PostNLLabel[] | null
  ProductCodeDelivery: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | undefined): ShipmentStatus {
  switch (status) {
    case 'Collected':        return 'PENDING'
    case 'InTransit':
    case 'Sorting':          return 'IN_TRANSIT'
    case 'Delivering':       return 'OUT_FOR_DELIVERY'
    case 'Delivered':        return 'DELIVERED'
    case 'ReturnToSender':   return 'RETURNED'
    case 'DeliveryAttempt':  return 'EXCEPTION'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: PostNLResponseShipment): Shipment {
  return {
    id: raw.Barcode,
    status: mapShipmentStatus(undefined),
    trackingNumber: raw.Barcode ?? undefined,
    carrierId: 'postnl',
    serviceCode: raw.ProductCodeDelivery ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
