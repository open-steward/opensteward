/**
 * APC Overnight — GetLabel response → canonical Label.
 *
 * The hypaship v3 API provides label retrieval via a GetLabel operation keyed
 * on the consignment (shipment) id. The adapter's REST abstraction surfaces
 * this as GET /labels/:id. A successful response carries the label URL and/or
 * base64-encoded PDF content alongside the consignment's tracking number.
 */
import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── APC Overnight raw types ─────────────────────────────────────────────────

export interface ApcOvernightLabelResponse {
  id?: string | null
  consignment_id?: string | null
  tracking_number?: string | null
  label_url?: string | null
  label_base64?: string | null
  format?: string | null
  status?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(raw: ApcOvernightLabelResponse): Label {
  return {
    id: raw.id ?? raw.consignment_id ?? undefined,
    shipmentId: raw.consignment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'apc-overnight',
    format: raw.format === 'PDF' ? 'PDF' : raw.format === 'ZPL' ? 'ZPL' : raw.format === 'PNG' ? 'PNG' : undefined,
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    base64: raw.label_base64 ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
