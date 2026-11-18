import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

/**
 * Raw response shape from:
 *   GET  /jobs/{job_id}
 *   POST /jobs  (create)
 *   PATCH /jobs/{job_id}  (confirm)
 */
export interface GophrUkJob {
  job_id?: string | null
  status?: string | null
  pickup_address?: Record<string, unknown> | null
  delivery_address?: Record<string, unknown> | null
  external_id?: string | null
  tracking_link?: string | null
  price_net?: number | null
  price_gross?: number | null
  currency?: string | null
  created_time?: string | null
  updated_time?: string | null
  [key: string]: unknown
}

export interface GophrUkJobListResponse {
  jobs?: GophrUkJob[]
  [key: string]: unknown
}

function mapShipmentStatus(raw: string | null | undefined): ShipmentStatus {
  const key = (raw ?? '').toLowerCase()
  return (SHIPMENT_STATUS_MAP[key] as ShipmentStatus) ?? 'UNKNOWN'
}

export function transformShipment(raw: GophrUkJob): Shipment {
  const id = raw.job_id ?? undefined
  const grossAmount = raw.price_gross ?? raw.price_net
  return {
    id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: id,
    carrierId: 'gophr-uk',
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.delivery_address ?? null),
    labelUrl: raw.tracking_link ?? undefined,
    reference: raw.external_id ?? undefined,
    cost:
      grossAmount !== null && grossAmount !== undefined
        ? { amount: grossAmount, currency: (raw.currency ?? 'GBP') as string }
        : undefined,
    createdAt: toISODate(raw.created_time),
    updatedAt: toISODate(raw.updated_time),
    metadata: raw as Record<string, unknown>,
  }
}
