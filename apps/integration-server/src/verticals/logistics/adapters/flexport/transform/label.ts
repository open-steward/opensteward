import type { Label, LabelStatus } from '../../../schema/label'
import { parseDecimal } from '../../shared/transform'

/**
 * Raw response from Flexport Logistics API:
 *   POST /logistics/api/2025-03/parcels        (createLabel)
 *   GET  /logistics/api/2025-03/parcels/{id}   (getLabel)
 *
 * Confirmed fields from https://docs.logistics-api.flexport.com/2025-03/tag/Parcels/
 */
export interface FlexportParcelResponse {
  parcelId?: string
  status?: string
  trackingCode?: string
  carrierCode?: string
  serviceLevel?: string
  price?: number
  shippingLabelUrl?: string
  packageTrackingUrl?: string
  flexportTrackingUrl?: string
  customerReferenceId?: string
  customerCustomField?: string
  carrierBarcode?: string
  [key: string]: unknown
}

function mapLabelStatus(status: string | undefined): LabelStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'OK':
      return 'CREATED'
    case 'ERROR':
      return 'VOIDED'
    default:
      return undefined
  }
}

export function transformLabel(raw: FlexportParcelResponse): Label {
  return {
    id: raw.parcelId != null ? String(raw.parcelId) : undefined,
    trackingNumber: raw.trackingCode ?? undefined,
    carrierId: raw.carrierCode ?? undefined,
    serviceCode: raw.serviceLevel ?? undefined,
    status: mapLabelStatus(raw.status),
    url: raw.shippingLabelUrl ?? undefined,
    cost: raw.price != null
      ? { amount: Math.round((parseDecimal(raw.price) ?? 0) * 100), currency: 'USD' }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
