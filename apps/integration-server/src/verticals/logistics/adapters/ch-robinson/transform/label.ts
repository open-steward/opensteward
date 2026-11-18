/**
 * C.H. Robinson label → canonical Label.
 *
 * Labels are created via POST /labels and fetched via GET /labels/{id}.
 * The response carries a direct download URL (url field) and optionally
 * base64-encoded content.
 *
 * Docs: https://developer.chrobinson.com/
 */

import type { Label } from '../../../schema/label'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface CHRLabelResponse {
  labelId?: string
  shipmentId?: string
  trackingNumber?: string
  serviceCode?: string
  format?: string
  status?: string
  url?: string
  base64?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLabel(raw: CHRLabelResponse): Label {
  return {
    id: raw.labelId ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'ch-robinson',
    serviceCode: raw.serviceCode ?? undefined,
    format: (raw.format as Label['format']) ?? undefined,
    status: (raw.status as Label['status']) ?? undefined,
    url: raw.url ?? undefined,
    base64: raw.base64 ?? undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
