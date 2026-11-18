import type { Label } from '../../../schema/label'
import { parseDecimal } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * Frenet label record returned from GET /shipment-label/{id} and
 * embedded in shipment responses.
 */
export interface FrenetLabel {
  ShipmentId?: string | null
  TrackingNumber?: string | null
  Carrier?: string | null
  CarrierCode?: string | null
  LabelUrl?: string | null
  LabelContent?: string | null // base64-encoded PDF content (when hosted URL not available)
  ShippingPrice?: number | string | null
  CreatedDate?: string | null
  UpdatedDate?: string | null
  /** Status: Active, Cancelled, etc. */
  Status?: string | null
  [key: string]: unknown
}

function mapLabelStatus(status: string | null | undefined): 'CREATED' | 'VOIDED' | 'USED' {
  if (!status) return 'CREATED'
  const s = status.toLowerCase()
  if (s.includes('cancel') || s.includes('void')) return 'VOIDED'
  if (s.includes('used') || s.includes('entregue') || s.includes('postado')) return 'USED'
  return 'CREATED'
}

export function transformLabel(raw: FrenetLabel): Label {
  const cost = parseDecimal(raw.ShippingPrice)
  return {
    id: raw.ShipmentId ?? undefined,
    shipmentId: raw.ShipmentId ?? undefined,
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.Carrier ?? undefined,
    serviceCode: raw.CarrierCode ?? undefined,
    format: 'PDF',
    status: mapLabelStatus(raw.Status),
    url: raw.LabelUrl ?? undefined,
    base64: raw.LabelContent ?? undefined,
    cost: cost != null ? { amount: Math.round(cost * 100), currency: 'BRL' } : undefined,
    createdAt: toIsoDatetime(raw.CreatedDate)
      ? new Date(toIsoDatetime(raw.CreatedDate)!)
      : undefined,
    updatedAt: toIsoDatetime(raw.UpdatedDate)
      ? new Date(toIsoDatetime(raw.UpdatedDate)!)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
