import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'
import type { AusPostOrderResponse } from './order'

// AusPost uses "orders" as the manifest concept: PUT /shipping/v1/orders
// creates a collection of shipments (order summary) that IS the manifest.
// We derive Manifest from the same order response shape.

export function transformManifest(raw: AusPostOrderResponse): Manifest {
  const shipmentIds = (raw.shipments ?? []).map((s) => s.shipment_id as string).filter(Boolean)
  const status = raw.order_summary?.status?.toUpperCase()
  let manifestStatus: Manifest['status']
  if (status === 'INITIATED' || status === 'CREATED') manifestStatus = 'OPEN'
  else if (status === 'LODGED') manifestStatus = 'SUBMITTED'
  else if (status === 'DELIVERED' || status === 'CLOSED') manifestStatus = 'CLOSED'
  else manifestStatus = undefined

  return {
    id: raw.order_id,
    carrierId: 'auspost',
    manifestNumber: raw.order_reference ?? raw.order_id,
    status: manifestStatus,
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: raw.order_summary?.number_of_shipments ?? undefined,
    submittedAt:
      status === 'LODGED' ? toISODate(raw.order_creation_date) : undefined,
    createdAt: toISODate(raw.order_creation_date),
    metadata: raw as Record<string, unknown>,
  }
}
