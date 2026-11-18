import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Raw response from POST /jobs/{job_id}/deliveries/{delivery_id}/label
 * (Gophr UK V2 Commercial API).
 *
 * The endpoint returns a URL to the generated label. The documented response
 * contains a `label_url` string and limited metadata about the associated
 * delivery.
 */
export interface GophrUkLabelResponse {
  label_url?: string | null
  delivery_id?: string | null
  job_id?: string | null
  tracking_number?: string | null
  created_time?: string | null
  [key: string]: unknown
}

export function transformLabel(raw: GophrUkLabelResponse, jobId?: string): Label {
  return {
    id: raw.delivery_id ?? undefined,
    shipmentId: raw.job_id ?? jobId ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'gophr-uk',
    serviceCode: 'gophr-uk',
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_time),
    metadata: raw as Record<string, unknown>,
  }
}
