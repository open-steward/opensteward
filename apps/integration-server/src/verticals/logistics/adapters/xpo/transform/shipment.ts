import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── XPO raw types ───────────────────────────────────────────────────────────
//
// Source: XPO LTL Bill of Lading API
// Endpoint: GET /billoflading/1.0/billsoflading/{bolInstId}/requester
// Envelope: { code, transactionTimestamp, data: { bolInfo: XpoBolResponse } }

export interface XpoBolAddress {
  name?: string | null
  companyName?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  cityName?: string | null
  stateCd?: string | null
  countryCd?: string | null
  postalCd?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface XpoBolResponse {
  /** Unique internal identifier for the bill of lading. */
  bolInstId?: string | null
  /** PRO (progressive) number — used as the canonical tracking number. */
  proNbr?: string | null
  proNumber?: string | null
  bolNumber?: string | null
  status?: string | null
  shipper?: XpoBolAddress | null
  consignee?: XpoBolAddress | null
  totalWeight?: number | null
  weightUnit?: string | null
  pickupDate?: string | null
  deliveryDate?: string | null
  serviceType?: string | null
  bolRemark?: string | null
  [key: string]: unknown
}

export interface XpoBolListResponse {
  data?: {
    bolInfo?: XpoBolResponse[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface XpoBolGetResponse {
  data?: {
    bolInfo?: XpoBolResponse
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toUpperCase()) {
    case 'CREATED':
    case 'PENDING':
    case 'SCHEDULED':
      return 'PENDING'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'IN TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
    case 'OUT FOR DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'RETURNED':
      return 'RETURNED'
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED'
    case 'EXCEPTION':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

// ─── Address helper ──────────────────────────────────────────────────────────

function transformXpoAddress(raw: XpoBolAddress | null | undefined): ReturnType<typeof toAddress> {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.companyName,
    street1: raw.addressLine1,
    street2: raw.addressLine2,
    city: raw.cityName,
    state: raw.stateCd,
    postalCode: raw.postalCd,
    country: raw.countryCd,
    phone: raw.phone,
    email: raw.email,
  })
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: XpoBolResponse): Shipment {
  const proNumber = raw.proNbr ?? raw.proNumber ?? undefined
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.bolInstId ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: proNumber,
    carrierId: 'xpo',
    serviceCode: raw.serviceType ?? undefined,
    mode: 'ltl',
    originAddress: transformXpoAddress(raw.shipper),
    destinationAddress: transformXpoAddress(raw.consignee),
    totalWeight: raw.totalWeight != null
      ? toWeight(raw.totalWeight, weightUnit)
      : undefined,
    reference: raw.bolNumber ?? undefined,
    notes: raw.bolRemark ?? undefined,
    estimatedDeliveryAt: toISODate(raw.deliveryDate),
    createdAt: toISODate(raw.pickupDate),
    metadata: raw as Record<string, unknown>,
  }
}
