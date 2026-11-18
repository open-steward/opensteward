import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress } from '../../shared/transform'

export interface OnfleetShipment {
  id: string
  shortId?: string | null
  state?: number | null
  pickupTask?: boolean | null
  destination?: { address?: Record<string, unknown> | null } | null
  recipients?: Array<{ name?: string; phone?: string }> | null
  trackingURL?: string | null
  notes?: string | null
  timeCreated?: number | null
  timeLastModified?: number | null
  [key: string]: unknown
}

function mapStatus(state: number | null | undefined): ShipmentStatus {
  switch (state) {
    case 0: return 'LABEL_CREATED'
    case 1: return 'IN_TRANSIT'
    case 2: return 'OUT_FOR_DELIVERY'
    case 3: return 'DELIVERED'
    default: return 'UNKNOWN'
  }
}

export function transformShipment(raw: OnfleetShipment): Shipment {
  const recipientAddress = raw.destination?.address ?? null
  const recipient = raw.recipients?.[0]
  if (recipient && recipientAddress) {
    (recipientAddress as Record<string, unknown>).name = (recipientAddress as Record<string, unknown>).name ?? recipient.name
  }
  return {
    id: raw.id,
    status: mapStatus(raw.state ?? undefined),
    trackingNumber: raw.shortId ?? raw.id,
    carrierId: 'onfleet',
    destinationAddress: toAddress(recipientAddress),
    labelUrl: raw.trackingURL ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: raw.timeCreated ? new Date(raw.timeCreated) : undefined,
    updatedAt: raw.timeLastModified ? new Date(raw.timeLastModified) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
