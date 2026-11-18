import { toIsoDatetime } from '@opensteward/shared'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress } from '../../shared/transform'
import { ELOGII_PLATFORM } from '../constants'

// eLogii task state enum
// 0 = created/unassigned, 1 = assigned, 2 = active/in-progress, 3 = completed, 4 = failed, 5 = cancelled
export interface ElogiiTask {
  _id: string
  trackingCode?: string | null
  state?: number | null
  taskType?: string | null  // 'delivery' | 'pickup'
  contact?: {
    name?: string | null
    phone?: string | null
    email?: string | null
  } | null
  location?: {
    address?: {
      formatted_address?: string | null
      name?: string | null
      street?: string | null
      street2?: string | null
      city?: string | null
      state?: string | null
      country?: string | null
      postcode?: string | null
      zip_code?: string | null
    } | null
    latitude?: number | null
    longitude?: number | null
  } | null
  pickupLocation?: {
    address?: {
      formatted_address?: string | null
      name?: string | null
      street?: string | null
      street2?: string | null
      city?: string | null
      state?: string | null
      country?: string | null
      postcode?: string | null
      zip_code?: string | null
    } | null
    latitude?: number | null
    longitude?: number | null
  } | null
  pickupContact?: {
    name?: string | null
    phone?: string | null
    email?: string | null
  } | null
  note?: string | null
  documents?: Array<{ url?: string | null }> | null
  scheduledAt?: string | null
  completedAt?: string | null
  failedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  eta?: string | null
  orderNumber?: string | null
  externalId?: string | null
  [key: string]: unknown
}

function mapTaskState(state: number | null | undefined): ShipmentStatus {
  switch (state) {
    case 0: return 'LABEL_CREATED'
    case 1: return 'PENDING'
    case 2: return 'IN_TRANSIT'
    case 3: return 'DELIVERED'
    case 4: return 'EXCEPTION'
    case 5: return 'CANCELLED'
    default: return 'UNKNOWN'
  }
}

function buildAddress(
  loc: ElogiiTask['location'] | ElogiiTask['pickupLocation'],
  contact: { name?: string | null; phone?: string | null; email?: string | null } | null | undefined,
) {
  if (!loc?.address && !contact) return undefined
  const addr = loc?.address ?? {}
  return toAddress({
    name: contact?.name ?? null,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    street1: addr.street ?? null,
    street2: addr.street2 ?? null,
    city: addr.city ?? null,
    state: addr.state ?? null,
    postalCode: addr.postcode ?? addr.zip_code ?? null,
    country: addr.country ?? null,
  })
}

export function transformShipment(raw: ElogiiTask): Shipment {
  return {
    id: raw._id,
    status: mapTaskState(raw.state ?? undefined),
    trackingNumber: raw.trackingCode ?? raw.externalId ?? raw._id,
    carrierId: ELOGII_PLATFORM,
    originAddress: buildAddress(raw.pickupLocation, raw.pickupContact),
    destinationAddress: buildAddress(raw.location, raw.contact),
    estimatedDeliveryAt: raw.eta ? (toIsoDatetime(raw.eta) ? new Date(toIsoDatetime(raw.eta)!) : undefined) : undefined,
    actualDeliveryAt: raw.completedAt ? (toIsoDatetime(raw.completedAt) ? new Date(toIsoDatetime(raw.completedAt)!) : undefined) : undefined,
    labelUrl: raw.documents?.[0]?.url ?? undefined,
    reference: raw.orderNumber ?? raw.externalId ?? undefined,
    notes: raw.note ?? undefined,
    createdAt: raw.createdAt ? (toIsoDatetime(raw.createdAt) ? new Date(toIsoDatetime(raw.createdAt)!) : undefined) : undefined,
    updatedAt: raw.updatedAt ? (toIsoDatetime(raw.updatedAt) ? new Date(toIsoDatetime(raw.updatedAt)!) : undefined) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
