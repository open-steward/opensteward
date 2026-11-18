/**
 * Deposco outbound shipment → canonical Shipment.
 *
 * Source: `OutboundShipmentDTO` (allOf `BaseShipmentDTO`), returned by
 *   GET /shipments/outboundShipments            ("Get a list of outbound shipments")
 *   GET /shipments/outboundShipments/{shipmentId} ("Get an outbound shipment")
 * in https://auth.deposco.com/public/spec?version=latest.
 *
 * Only documented fields are read. Not mapped, on purpose:
 *   - cost: `shippingCosts.shippingCost` is a decimal in major units and
 *     `shippingCosts.currencyCode` is an enum that includes non-ISO values
 *     ("GPB", "CAN"), so a Money value cannot be built honestly;
 *   - labelUrl: the DTO documents no label field (only `trackingUrl`);
 *   - mode: `shipMode` "Ground" does not say parcel, LTL or FTL.
 */
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import {
  isWeightUom,
  selfId,
  toDate,
  toDeposcoAddress,
  type DeposcoAddressFields,
  type DeposcoEntityRef,
} from '../dto'

export interface DeposcoOutboundShipment {
  /** `self.id` is the `{shipmentId}` of GET /shipments/outboundShipments/{shipmentId}. */
  self?: DeposcoEntityRef | null
  /** "Unique identification number for the shipment." */
  number?: string | null
  /** enum New, Shipping, Shipped, Rolled Back, Failed — "Status of the shipment." */
  status?: string | null
  /** "Shipping service that is used to send the shipment." */
  shipVia?: string | null
  /** "Shipping method that is used to send the shipment." */
  shipMethod?: string | null
  /** "Shipping carrier that is used to send the shipment." */
  shipVendor?: string | null
  /** "Tracking number for the shipment." */
  trackingNumber?: string | null
  /** "Tracking URL and tracking number for the shipment." */
  trackingUrl?: string | null
  shipFromFacility?: DeposcoEntityRef | null
  shipToContact?: {
    name?: string | null
    phone?: string | null
    email?: string | null
    [key: string]: unknown
  } | null
  shipToAddress?: DeposcoAddressFields | null
  shipFromContact?: { phone?: string | null; [key: string]: unknown } | null
  shipFromAddress?: DeposcoAddressFields | null
  shipmentDates?: {
    /** "Date that the shipment is expected to arrive at the destination facility." */
    plannedArrivalDate?: string | null
    /** "Date that the shipment arrived at the destination facility." */
    actualArrivalDate?: string | null
    [key: string]: unknown
  } | null
  /** "Total weight of the shipment." `value` (double) + `units` (WeightUOM). */
  totalWeight?: { value?: number | null; units?: string | null; [key: string]: unknown } | null
  /** "Date and time that the shipment was created." */
  createdDate?: string | null
  /** "Date and time that the shipment was last updated." */
  updatedDate?: string | null
  [key: string]: unknown
}

/**
 * The documented status enum. "Shipped" is handed to the carrier, so in
 * transit as far as the WMS knows. "Rolled Back" (a reversed ship
 * confirmation) has no canonical equivalent.
 */
function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'New':
    case 'Shipping':
      return 'PENDING'
    case 'Shipped':
      return 'IN_TRANSIT'
    case 'Failed':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: DeposcoOutboundShipment): Shipment {
  const weight = raw.totalWeight
  return {
    id: selfId(raw.self),
    status: mapStatus(raw.status),
    trackingNumber: raw.trackingNumber || undefined,
    carrierId: raw.shipVendor || undefined,
    serviceCode: raw.shipVia || undefined,
    warehouseId: selfId(raw.shipFromFacility),
    originAddress: toDeposcoAddress(raw.shipFromAddress, { phone: raw.shipFromContact?.phone }),
    destinationAddress: toDeposcoAddress(raw.shipToAddress, {
      name: raw.shipToContact?.name,
      phone: raw.shipToContact?.phone,
      email: raw.shipToContact?.email,
    }),
    totalWeight:
      weight && typeof weight.value === 'number' && weight.value >= 0 && isWeightUom(weight.units)
        ? { value: weight.value, unit: weight.units }
        : undefined,
    reference: raw.number || undefined,
    estimatedDeliveryAt: toDate(raw.shipmentDates?.plannedArrivalDate),
    actualDeliveryAt: toDate(raw.shipmentDates?.actualArrivalDate),
    createdAt: toDate(raw.createdDate),
    updatedAt: toDate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
