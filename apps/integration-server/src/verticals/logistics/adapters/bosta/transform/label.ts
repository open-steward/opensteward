import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Raw shape returned by GET /deliveries/awb/:deliveryId
 * (confirmed via official Bosta Node.js + Python SDK source)
 *
 * The AWB (Airway Bill) endpoint returns the label for a delivery.
 * The exact field structure is partially undocumented; the response
 * wraps the data under `data`. Common fields observed in SDK usage:
 */
export interface BostaAWBRaw {
  _id?: string | null
  deliveryId?: string | null
  trackingNumber?: string | null
  url?: string | null
  label_url?: string | null
  base64?: string | null
  format?: string | null
  status?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

/** Envelope returned by GET /deliveries/awb/:id */
export interface BostaAWBResponse {
  data?: BostaAWBRaw
  success?: boolean
  message?: string
}

export function transformLabel(deliveryId: string, raw: BostaAWBRaw): Label {
  const labelUrl = raw.url ?? raw.label_url ?? undefined
  return {
    id: raw._id ?? deliveryId,
    shipmentId: raw.deliveryId ?? deliveryId,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'bosta',
    format: undefined, // Bosta returns PDF but format is not exposed in the API response
    status: 'CREATED',
    url: typeof labelUrl === 'string' ? labelUrl : undefined,
    base64: typeof raw.base64 === 'string' ? raw.base64 : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
