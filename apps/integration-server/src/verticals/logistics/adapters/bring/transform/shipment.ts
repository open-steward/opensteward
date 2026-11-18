import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Bring raw types ────────────────────────────────────────────────────────

export interface BringBookingResponse {
  consignments: BringBookedConsignment[]
  [key: string]: unknown
}

export interface BringBookedConsignment {
  consignmentNumber: string
  productSpecificData: Record<string, unknown> | null
  packages: BringBookedPackage[]
  confirmation: BringConfirmation | null
  [key: string]: unknown
}

export interface BringBookedPackage {
  packageNumber: string
  correlationId: string | null
  [key: string]: unknown
}

export interface BringConfirmation {
  consignmentNumber: string
  productCode: string | null
  dateOfShipment: string | null
  links: BringLink | null
  [key: string]: unknown
}

export interface BringLink {
  labels: string | null
  tracking: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: BringBookedConsignment): Shipment {
  const firstPackage = raw.packages?.[0]

  return {
    id: raw.consignmentNumber,
    status: 'PENDING' as ShipmentStatus,
    trackingNumber: firstPackage?.packageNumber ?? raw.consignmentNumber,
    carrierId: 'bring',
    serviceCode: raw.confirmation?.productCode ?? undefined,
    labelUrl: raw.confirmation?.links?.labels ?? undefined,
    createdAt: toISODate(raw.confirmation?.dateOfShipment),
    metadata: raw as Record<string, unknown>,
  }
}
