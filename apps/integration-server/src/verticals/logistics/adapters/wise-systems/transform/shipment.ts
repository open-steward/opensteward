import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw Wise Systems task object as returned by GET /task/{id} or GET /tasks.
 * Field names follow the documented API response schema.
 */
export interface WiseSystemsTask {
  id: string
  type?: 'pickup' | 'delivery' | string | null
  status?: number | null           // 0=pending,1=accepted,2=in-progress,3=completed
  location?: Record<string, unknown> | null
  props?: {
    time_window_start?: string | number | null
    time_window_end?: string | number | null
    scheduled_at?: string | number | null
    completed_at?: string | number | null
    service_time?: number | null
    notes?: string | null
    reference?: string | null
    [key: string]: unknown
  } | null
  destination?: Record<string, unknown> | null
  origin?: Record<string, unknown> | null
  customer?: Record<string, unknown> | null
  driver_id?: string | null
  vehicle_id?: string | null
  created_at?: string | number | null
  updated_at?: string | number | null
  [key: string]: unknown
}

function mapStatus(status: number | null | undefined, type: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 0: return 'PENDING'
    case 1: return 'LABEL_CREATED'
    case 2: return type === 'delivery' ? 'OUT_FOR_DELIVERY' : 'IN_TRANSIT'
    case 3: return 'DELIVERED'
    default: return 'UNKNOWN'
  }
}

export function transformShipment(raw: WiseSystemsTask): Shipment {
  const props = raw.props ?? {}
  return {
    id: raw.id,
    status: mapStatus(raw.status ?? undefined, raw.type ?? undefined),
    trackingNumber: raw.id,
    carrierId: 'wise-systems',
    originAddress: toAddress(raw.origin ?? undefined),
    destinationAddress: toAddress(raw.location ?? raw.destination ?? undefined),
    reference: (props.reference as string | undefined) ?? undefined,
    notes: (props.notes as string | undefined) ?? undefined,
    estimatedDeliveryAt: toISODate(props.time_window_end ?? props.scheduled_at),
    actualDeliveryAt: toISODate(props.completed_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
