import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { parseDecimal, toAddress, toISODate } from '../../shared/transform'

// ─── R+L Carriers raw BOL types ───────────────────────────────────────────────
// Source: GET /BillOfLading?ProNumber={proNumber}

export interface RplusLAddress {
  CompanyName?: string | null
  AddressLine1?: string | null
  AddressLine2?: string | null
  City?: string | null
  StateOrProvince?: string | null
  ZipOrPostalCode?: string | null
  CountryCode?: string | null
  PhoneNumber?: string | null
  ContactName?: string | null
  [key: string]: unknown
}

export interface RplusLHandlingUnit {
  Pieces?: number | null
  Type?: string | null
  Weight?: number | null
  [key: string]: unknown
}

export interface RplusLBOL {
  ProNumber?: string | null
  BOLNumber?: string | null
  ShipmentConfirmationNumber?: string | null
  Status?: string | null
  Shipper?: RplusLAddress | null
  Consignee?: RplusLAddress | null
  BillTo?: RplusLAddress | null
  ServiceLevel?: string | null
  PickupDate?: string | null
  EstimatedDeliveryDate?: string | null
  DeliveryDate?: string | null
  TotalPieces?: number | null
  TotalWeight?: number | null
  SpecialInstructions?: string | null
  ReferenceNumber?: string | null
  HandlingUnits?: RplusLHandlingUnit[] | null
  TotalCharge?: number | null
  Currency?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapShipmentStatus(raw: string | null | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  const s = raw.toUpperCase()
  if (s.includes('DELIVER')) return 'DELIVERED'
  if (s.includes('OUT FOR') || s.includes('OUT_FOR')) return 'OUT_FOR_DELIVERY'
  if (s.includes('TRANSIT') || s.includes('IN_TRANSIT') || s.includes('PICKUP')) return 'IN_TRANSIT'
  if (s.includes('EXCEPTION') || s.includes('CLAIM')) return 'EXCEPTION'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('CREATED') || s.includes('BOL') || s.includes('LABEL')) return 'LABEL_CREATED'
  return 'UNKNOWN'
}

function mapAddress(raw: RplusLAddress | null | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.ContactName,
    company: raw.CompanyName,
    address1: raw.AddressLine1,
    address2: raw.AddressLine2,
    city: raw.City,
    state: raw.StateOrProvince,
    postal_code: raw.ZipOrPostalCode,
    country_code: raw.CountryCode,
    phone: raw.PhoneNumber,
  })
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: RplusLBOL): Shipment {
  const totalWeight = parseDecimal(raw.TotalWeight)

  return {
    id: raw.ProNumber ?? undefined,
    status: mapShipmentStatus(raw.Status),
    trackingNumber: raw.ProNumber ?? undefined,
    carrierId: 'rplust',
    serviceCode: raw.ServiceLevel ?? undefined,
    originAddress: mapAddress(raw.Shipper),
    destinationAddress: mapAddress(raw.Consignee),
    totalWeight: totalWeight !== undefined ? { value: totalWeight, unit: 'lb' } : undefined,
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.DeliveryDate),
    cost:
      raw.TotalCharge !== null && raw.TotalCharge !== undefined
        ? { amount: raw.TotalCharge, currency: (raw.Currency as string) ?? 'USD' }
        : undefined,
    reference: raw.ReferenceNumber ?? raw.BOLNumber ?? undefined,
    notes: raw.SpecialInstructions ?? undefined,
    mode: 'ltl',
    createdAt: toISODate(raw.PickupDate),
    metadata: raw as Record<string, unknown>,
  }
}
