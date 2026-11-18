import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Parcel2Go label response.
 * Returned by GET /api/labels/{orderId}  (base64 PDF)
 * or POST /api/label (label request response).
 */
export interface Parcel2GoLabelResponse {
  /** Base64-encoded PDF label content. */
  Base64EncodedLabels?: string[] | null
  /** The order line ID these labels belong to. */
  OrderLineId?: string | null
  /** When the label was generated. */
  GeneratedAt?: string | null
  [key: string]: unknown
}

export function transformLabel(
  raw: Parcel2GoLabelResponse,
  orderId: string,
  trackingNumber?: string,
  carrierId?: string,
): Label {
  const base64Content = raw.Base64EncodedLabels?.[0] ?? undefined

  return {
    id: raw.OrderLineId ?? orderId,
    shipmentId: orderId,
    trackingNumber,
    carrierId,
    format: 'PDF',
    status: 'CREATED',
    base64: base64Content,
    createdAt: toISODate(raw.GeneratedAt),
    metadata: raw as Record<string, unknown>,
  }
}
