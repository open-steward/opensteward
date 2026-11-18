import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Pochta Rossii label/form response.
 * The Otpravka API generates labels via GET /1.0/forms/{shipmentId}/f7p
 * The response is typically a PDF binary, but some endpoints return a URL or metadata.
 */
export interface PochtaRussiaLabelMeta {
  id?: string | number | null
  'barcode'?: string | null
  'shipment-id'?: string | number | null
  'label-url'?: string | null
  'form-url'?: string | null
  'created-on'?: string | null
  'updated-on'?: string | null
  [key: string]: unknown
}

export function transformLabel(
  raw: PochtaRussiaLabelMeta,
  shipmentId?: string,
  trackingNumber?: string,
): Label {
  const id = raw['id'] != null ? String(raw['id']) : (shipmentId ?? undefined)
  const url = raw['label-url'] ?? raw['form-url'] ?? undefined

  return {
    id,
    shipmentId: shipmentId ?? (raw['shipment-id'] != null ? String(raw['shipment-id']) : undefined),
    trackingNumber: trackingNumber ?? raw['barcode'] ?? undefined,
    carrierId: 'pochta-russia',
    format: 'PDF',
    status: 'CREATED',
    url: url ?? undefined,
    createdAt: toISODate(raw['created-on']),
    updatedAt: toISODate(raw['updated-on']),
    metadata: raw as Record<string, unknown>,
  }
}
