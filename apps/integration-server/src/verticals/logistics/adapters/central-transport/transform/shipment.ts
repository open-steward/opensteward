/**
 * Central Transport shipment transforms.
 *
 * Piyovi POST /v1/shipment returns a created shipment response.
 * This maps the carrier/Piyovi response to the canonical Shipment schema.
 */
import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Raw Piyovi types ────────────────────────────────────────────────────────

export interface PiyoviShipmentResponse {
  shipmentId?: string
  id?: string
  activityId?: string
  proNumber?: string
  trackingNumber?: string
  bolNumber?: string
  status?: string
  carrierCode?: string
  serviceCode?: string
  estimatedDeliveryDate?: string
  createdAt?: string
  createdDate?: string
  labelUrl?: string
  bolUrl?: string
  referenceNumber?: string
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: PiyoviShipmentResponse): Shipment {
  const id = raw.shipmentId ?? raw.id ?? raw.activityId ?? raw.bolNumber
  const trackingNumber = raw.proNumber ?? raw.trackingNumber ?? undefined
  const createdAt = toISODate(raw.createdAt ?? raw.createdDate)

  return {
    id: id ?? undefined,
    status: 'PENDING',
    trackingNumber,
    carrierId: 'central-transport',
    serviceCode: raw.serviceCode ?? undefined,
    labelUrl: raw.bolUrl ?? raw.labelUrl ?? undefined,
    reference: raw.referenceNumber ?? raw.bolNumber ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: createdAt ?? toISODate(new Date().toISOString()),
    mode: 'ltl',
    metadata: raw as Record<string, unknown>,
  }
}
