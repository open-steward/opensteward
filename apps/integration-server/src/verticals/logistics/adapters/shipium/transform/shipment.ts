import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type ShipiumAddress } from './address'

/**
 * Shipium carrier selection / label response structure.
 * Returned by POST /shipment/carrierselection/label
 */
export interface ShipiumCarrierSelection {
  carrierSelectionId?: string | null
  carrier?: string | null
  serviceMethodName?: string | null
  serviceMethodCode?: string | null
  totalCost?: number | null
  currencyCode?: string | null
  transitDays?: number | null
  estimatedDeliveryDate?: string | null
  [key: string]: unknown
}

export interface ShipiumCarrierLabel {
  shipiumLabelId?: string | null
  status?: string | null
  carrierTrackingId?: string | null
  carrierTrackingLink?: string | null
  documents?: Array<{
    labelFormat?: string | null
    labelUrl?: string | null
    [key: string]: unknown
  }> | null
  [key: string]: unknown
}

export interface ShipiumPackagingType {
  length?: number | null    // inches
  width?: number | null     // inches
  height?: number | null    // inches
  weight?: number | null    // pounds
  weightUnit?: string | null
  [key: string]: unknown
}

export interface ShipiumShipmentParameters {
  orderedDateTime?: string | null
  destinationAddress?: ShipiumAddress | null
  shipFromAddress?: ShipiumAddress | null
  originId?: string | null
  returnToAddress?: ShipiumAddress | null
  packagingType?: ShipiumPackagingType | null
  totalWeight?: { value?: number | null; unitOfMeasure?: string | null } | null
  [key: string]: unknown
}

export interface ShipiumShipment {
  shipiumShipmentId?: string | null
  partnerShipmentId?: string | null
  shipmentStatus?: string | null
  carrierSelection?: ShipiumCarrierSelection | null
  carrierLabel?: ShipiumCarrierLabel | null
  shipmentParameters?: ShipiumShipmentParameters | null
  testMode?: boolean | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'label_created':
    case 'labelcreated':
    case 'label printed':
    case 'label_printed':
      return 'LABEL_CREATED'
    case 'registered':
      return 'PENDING'
    case 'in_transit':
    case 'in transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'out for delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
      return 'EXCEPTION'
    case 'return_to_sender':
    case 'return to sender':
    case 'returned':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function pickLabelUrl(label: ShipiumCarrierLabel | null | undefined): string | undefined {
  if (!label) return undefined
  const docs = label.documents ?? []
  // Prefer PDF, then first available
  const pdf = docs.find((d) => (d.labelFormat ?? '').toLowerCase() === 'pdf')
  const first = docs[0]
  return (pdf ?? first)?.labelUrl ?? undefined
}

export function transformShipment(raw: ShipiumShipment): Shipment {
  const cs = raw.carrierSelection
  const sp = raw.shipmentParameters
  const pkg = sp?.packagingType
  const tw = sp?.totalWeight

  // Resolve weight — prefer shipmentParameters.totalWeight, fall back to packagingType.weight
  const weightValue = parseDecimal(tw?.value ?? pkg?.weight)
  const weightUnit = (tw?.unitOfMeasure ?? 'lb').toLowerCase().includes('oz') ? 'oz' : 'lb'

  return {
    id: raw.shipiumShipmentId ?? undefined,
    status: mapShipmentStatus(raw.shipmentStatus),
    trackingNumber: raw.carrierLabel?.carrierTrackingId ?? undefined,
    carrierId: cs?.carrier ?? undefined,
    serviceCode: cs?.serviceMethodCode ?? cs?.serviceMethodName ?? undefined,
    originAddress: transformAddress(sp?.shipFromAddress),
    destinationAddress: transformAddress(sp?.destinationAddress),
    returnAddress: transformAddress(sp?.returnToAddress),
    totalWeight:
      weightValue !== undefined
        ? { value: weightValue, unit: weightUnit }
        : undefined,
    dimensions:
      pkg
        ? toDimensions(pkg.length, pkg.width, pkg.height, 'in')
        : undefined,
    estimatedDeliveryAt: toISODate(cs?.estimatedDeliveryDate),
    labelUrl: pickLabelUrl(raw.carrierLabel),
    cost:
      cs?.totalCost !== undefined && cs.totalCost !== null
        ? {
            // Shipium totalCost is a decimal dollar amount — convert to minor units (cents)
            amount: Math.round((parseDecimal(cs.totalCost) ?? 0) * 100),
            currency: (cs.currencyCode ?? 'USD').toUpperCase(),
          }
        : undefined,
    reference: raw.partnerShipmentId ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
