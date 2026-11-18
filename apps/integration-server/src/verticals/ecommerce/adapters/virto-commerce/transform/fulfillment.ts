/**
 * Virto Commerce OrderShipment → canonical Fulfillment.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Orders/swagger.json` →
 * `components.schemas.OrderShipment`. There is no carrier display-name
 * field, only a `shipmentMethodCode` (store-configured shipping method
 * identifier, e.g. `FedEx-Ground`) — mapped onto `service`, with `carrier`
 * left unset rather than guessed.
 */
import type { Fulfillment } from '../../../schema/fulfillment'

export interface RawVirtoOrderShipment {
  id: string
  customerOrderId?: string
  fulfillmentCenterId?: string
  shipmentMethodCode?: string
  trackingNumber?: string
  trackingUrl?: string
  status?: string
  deliveryDate?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformFulfillment(raw: RawVirtoOrderShipment): Fulfillment {
  // `orderId` is required on the canonical schema; a shipment record with
  // none is malformed data we can't represent honestly.
  if (!raw.customerOrderId) {
    throw new Error(`Virto Commerce shipment ${raw.id} has no customerOrderId`)
  }
  return {
    id: raw.id,
    orderId: raw.customerOrderId,
    trackingNumber: raw.trackingNumber,
    trackingUrl: raw.trackingUrl,
    service: raw.shipmentMethodCode,
    locationId: raw.fulfillmentCenterId,
    deliveredAt: raw.deliveryDate,
    createdAt: raw.createdDate,
    updatedAt: raw.modifiedDate,
    metadata: { ...raw },
  }
}
