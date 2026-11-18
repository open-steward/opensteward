import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import {
  transformAddress,
  transformDocAddress,
  type ShippyProAddress,
  type ShippyProDocAddress,
} from './address'

/**
 * ShippyPro shipment response (returned by the "Ship" method).
 * Fields use PascalCase as returned by the ShippyPro API.
 */
export interface ShippyProShipment {
  TransactionId?: string | null
  OrderId?: string | null
  TrackingNumber?: string | null
  CarrierName?: string | null
  ServiceName?: string | null
  Status?: string | null
  LabelUrl?: string | null
  LabelFormat?: string | null
  ShipDate?: string | null
  DeliveryDate?: string | null
  Price?: number | string | null
  Currency?: string | null
  Weight?: number | string | null
  WeightUnit?: string | null
  Reference?: string | null
  ToAddress?: ShippyProAddress | null
  FromAddress?: ShippyProAddress | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'label_created':
    case 'pending':
      return 'LABEL_CREATED'
    case 'in_transit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
    case 'error':
      return 'EXCEPTION'
    case 'returned':
    case 'return_to_sender':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function resolveWeightUnit(unit: string | null | undefined): 'oz' | 'lb' | 'g' | 'kg' {
  switch ((unit ?? '').toLowerCase()) {
    case 'lb':
    case 'lbs':
      return 'lb'
    case 'g':
    case 'gr':
    case 'gram':
    case 'grams':
      return 'g'
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return 'kg'
    default:
      return 'kg'
  }
}

export function transformShipment(raw: ShippyProShipment): Shipment {
  const price = parseDecimal(raw.Price)
  const currency = raw.Currency ?? undefined

  return {
    id: raw.TransactionId ?? raw.OrderId ?? undefined,
    status: mapShipmentStatus(raw.Status),
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.CarrierName ?? undefined,
    serviceCode: raw.ServiceName ?? undefined,
    originAddress: raw.FromAddress ? transformAddress(raw.FromAddress) : undefined,
    destinationAddress: raw.ToAddress ? transformAddress(raw.ToAddress) : undefined,
    totalWeight: toWeight(raw.Weight, resolveWeightUnit(raw.WeightUnit)),
    labelUrl: raw.LabelUrl ?? undefined,
    cost:
      price !== undefined && currency
        ? { amount: price, currency }
        : undefined,
    reference: raw.Reference ?? undefined,
    createdAt: toISODate(raw.CreatedAt ?? raw.ShipDate),
    updatedAt: toISODate(raw.UpdatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

// ─── Documented v1 read shapes ──────────────────────────────────────────────
//
// The transform above maps the undocumented shape the write methods still
// assume. The two below read only fields documented in
// https://api.shippypro.com/docs/v1.json.

/** A documented "Unix timestamp (seconds), as a string" as a Date. */
function fromUnixSeconds(value: string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined
}

function absoluteUrl(value: string | null | undefined): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined
}

/**
 * One row of `GetShipmentsReport` (`GetShipmentsReportResponse.Shipments[]`):
 * "OrderID" ("1234567"), "TransactionID" ("ORDER2365"), "CarrierName",
 * "CarrierService", "TrackingNumber", "Date" ("Unix timestamp (seconds), as a
 * string."), "to_address" / "from_address" (`Address`), and more.
 */
export interface ShippyProReportShipment {
  OrderID?: string | null
  TransactionID?: string | null
  CarrierName?: string | null
  CarrierService?: string | null
  TrackingNumber?: string | null
  Date?: string | null
  to_address?: ShippyProDocAddress | null
  from_address?: ShippyProDocAddress | null
  [key: string]: unknown
}

/**
 * `id` is the ShippyPro `OrderID`, which `GetOrder` reads back ("The `OrderID`
 * number is the unique ID given to the order at the time it was processed.").
 *
 * Left out on purpose: `carrierId` (the row names the carrier, `CarrierName`,
 * but not the `CarrierID` that `listCarriers` uses as Carrier.id), `status`
 * (`OrderStatus` is an integer with no documented values), `cost`
 * (`shipment_cost` has no currency), and parcel weights and dimensions (no
 * documented units). All stay in `metadata`.
 */
export function transformReportShipment(raw: ShippyProReportShipment): Shipment {
  return {
    id: raw.OrderID ?? undefined,
    trackingNumber: raw.TrackingNumber || undefined,
    serviceCode: raw.CarrierService || undefined,
    originAddress: raw.from_address ? transformDocAddress(raw.from_address) : undefined,
    destinationAddress: raw.to_address ? transformDocAddress(raw.to_address) : undefined,
    reference: raw.TransactionID || undefined,
    createdAt: fromUnixSeconds(raw.Date),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `GetOrder` response (`GetOrderResponse`): "OrderID", "TransactionID",
 * "CarrierID", "TrackingCarrier", "TrackingNumber", "Status" ("Current
 * tracking status.", example "1"), "LabelURL" ("List of label URLs.").
 */
export interface ShippyProOrderDetail {
  Result?: string | null
  OrderID?: string | null
  TransactionID?: string | null
  CarrierID?: string | null
  TrackingCarrier?: string | null
  TrackingNumber?: string | null
  Status?: string | null
  LabelURL?: string[] | null
  [key: string]: unknown
}

/**
 * `Status` is the current tracking status, on the documented tracking code
 * values ("Tracking Code Values"): "``0`` | Order In Preparation",
 * "`1` | Info Received", "`2` | In Transit", "`3` | Out for Delivery",
 * "`4` | Missed Delivery", "`5` | Exception", "`6` | Delivered".
 */
function mapTrackingCodeToShipmentStatus(code: string | null | undefined): ShipmentStatus {
  switch (code) {
    case '0':
      return 'PENDING'
    case '1':
      return 'LABEL_CREATED'
    case '2':
      return 'IN_TRANSIT'
    case '3':
      return 'OUT_FOR_DELIVERY'
    case '4':
    case '5':
      return 'EXCEPTION'
    case '6':
      return 'DELIVERED'
    default:
      return 'UNKNOWN'
  }
}

export function transformOrderDetailShipment(raw: ShippyProOrderDetail): Shipment {
  return {
    id: raw.OrderID ?? undefined,
    status: mapTrackingCodeToShipmentStatus(raw.Status),
    trackingNumber: raw.TrackingNumber || undefined,
    carrierId: raw.CarrierID || undefined,
    labelUrl: absoluteUrl(raw.LabelURL?.[0]),
    reference: raw.TransactionID || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
