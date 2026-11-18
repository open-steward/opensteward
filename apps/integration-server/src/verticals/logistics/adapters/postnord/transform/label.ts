import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { PostNordShipment } from './shipment'

// ─── Derived transform ──────────────────────────────────────────────────────
//
// PostNord does not expose a standalone label endpoint. Labels are returned as
// a `labelUrl` field embedded in the shipment booking response
// (POST /rest/shipment/v1/shipments). We derive the canonical Label record
// from the PostNord shipment response.
//
// Source: https://developer.postnord.com/ Booking APIs v3 + Norway portal
//         Postman collection — booking response includes labelUrl (PDF/ZPL).

export function transformLabel(raw: PostNordShipment): Label | undefined {
  if (!raw.labelUrl) return undefined

  return {
    id: raw.shipmentId ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.itemId ?? undefined,
    carrierId: 'postnord',
    serviceCode: raw.serviceCode ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.labelUrl,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
