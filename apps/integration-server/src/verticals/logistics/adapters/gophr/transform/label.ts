/**
 * Gophr V2 Commercial API — Generate Label → canonical Label.
 *
 * The label endpoint returns a URL to a printable PDF label.
 *
 * Endpoint:  POST  /jobs/{job_id}/deliveries/{delivery_id}/label
 * Response:  { label_url: string; ... }
 *
 * Docs: https://developers.gophr.com/docs/generate-a-label
 */
import type { Label } from '../../../schema/label'

// ─── Gophr raw types ────────────────────────────────────────────────────────

export interface GophrLabelResponse {
  /** Hosted PDF label URL. */
  label_url?: string | null
  /** Mirrors back the delivery_id. */
  delivery_id?: string | null
  /** Mirrors back the job_id. */
  job_id?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(
  raw: GophrLabelResponse,
  jobId?: string,
  deliveryId?: string,
): Label {
  return {
    id: raw.delivery_id ?? deliveryId ?? undefined,
    shipmentId: raw.job_id ?? jobId ?? undefined,
    carrierId: 'gophr',
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
