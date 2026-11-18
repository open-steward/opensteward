import type { Shipment } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * R+L Carriers Pickup Request response.
 * POST /PickupRequest
 */
export interface RlCarriersPickupResponse {
  ConfirmationNumber?: string
  ProNumber?: string
  PickupDate?: string
  Status?: string
  [key: string]: unknown
}

/**
 * R+L Carriers Bill of Lading response.
 * POST /BillOfLading
 */
export interface RlCarriersBolResponse {
  BolNumber?: string
  ProNumber?: string
  PickupDate?: string
  EstimatedDeliveryDate?: string
  TotalCharges?: number
  Shipper?: RlCarriersAddressRaw
  Consignee?: RlCarriersAddressRaw
  Status?: string
  [key: string]: unknown
}

export interface RlCarriersAddressRaw {
  Name?: string
  CompanyName?: string
  Address1?: string
  Address2?: string
  City?: string
  State?: string
  Zip?: string
  Country?: string
  Phone?: string
  Email?: string
  [key: string]: unknown
}

function toAddress(raw?: RlCarriersAddressRaw): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.Name ?? undefined,
    company: raw.CompanyName ?? undefined,
    street1: raw.Address1 ?? undefined,
    street2: raw.Address2 ?? undefined,
    city: raw.City ?? undefined,
    state: raw.State ?? undefined,
    postalCode: raw.Zip ?? undefined,
    country: (raw.Country ?? 'US') as 'US',
    phone: raw.Phone ?? undefined,
    email: raw.Email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

export function transformPickupShipment(raw: RlCarriersPickupResponse): Shipment {
  return {
    id: raw.ConfirmationNumber ?? undefined,
    status: 'PENDING',
    trackingNumber: raw.ProNumber ?? undefined,
    carrierId: 'rl-carriers',
    mode: 'ltl',
    reference: raw.ConfirmationNumber ?? undefined,
    createdAt: toISODate(raw.PickupDate) ?? new Date(),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformBolShipment(raw: RlCarriersBolResponse): Shipment {
  const status = raw.Status?.toLowerCase()
  let canonicalStatus: Shipment['status'] = 'PENDING'
  if (status?.includes('transit')) canonicalStatus = 'IN_TRANSIT'
  else if (status?.includes('deliver')) canonicalStatus = 'DELIVERED'
  else if (status?.includes('label') || status?.includes('bol')) canonicalStatus = 'LABEL_CREATED'

  return {
    id: raw.BolNumber ?? undefined,
    status: canonicalStatus,
    trackingNumber: raw.ProNumber ?? raw.BolNumber ?? undefined,
    carrierId: 'rl-carriers',
    mode: 'ltl',
    originAddress: toAddress(raw.Shipper),
    destinationAddress: toAddress(raw.Consignee),
    reference: raw.BolNumber ?? undefined,
    createdAt: toISODate(raw.PickupDate) ?? new Date(),
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    cost:
      typeof raw.TotalCharges === 'number'
        ? { amount: raw.TotalCharges, currency: 'USD' }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
