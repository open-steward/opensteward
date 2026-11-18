import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface InnoshipLabelResponse {
  /** AWB (shipment tracking number) */
  awb?: string | null
  courierId?: number | null
  /** Base64-encoded label content */
  pdfBase64?: string | null
  /** Hosted label URL if available */
  labelUrl?: string | null
  format?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformLabel(
  raw: InnoshipLabelResponse,
  shipmentId?: string,
): Label {
  return {
    id: raw.awb ?? shipmentId ?? undefined,
    shipmentId,
    trackingNumber: raw.awb ?? undefined,
    carrierId: raw.courierId != null ? String(raw.courierId) : undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: raw.pdfBase64 ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
