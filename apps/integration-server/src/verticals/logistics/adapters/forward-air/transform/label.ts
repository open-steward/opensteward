import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Forward Air raw types ────────────────────────────────────────────────
// Source: GET /ltlservices/v2/rest/waybills/{referenceNumber}/documents/LABEL
// (document download) and
// GET /ltlservices/v2/rest/waybills/{referenceNumber}/documents (list)

export interface ForwardAirDocumentResponse {
  documentType?: string | null
  fileName?: string | null
  fileType?: string | null
  waybillGabsKey?: string | null
  fileSize?: number | null
  link?: string | null
  // Populated when base64 content is returned directly
  content?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(
  raw: ForwardAirDocumentResponse,
  referenceNumber?: string,
): Label {
  const fmt = raw.fileType?.toUpperCase()
  const labelFormat =
    fmt === 'PDF' ? 'PDF'
    : fmt === 'PNG' ? 'PNG'
    : fmt === 'ZPL' ? 'ZPL'
    : undefined

  return {
    id: raw.waybillGabsKey ?? referenceNumber ?? undefined,
    shipmentId: referenceNumber ?? raw.waybillGabsKey ?? undefined,
    carrierId: 'forward-air',
    format: labelFormat,
    status: 'CREATED',
    url: raw.link ?? undefined,
    base64: raw.content ?? undefined,
    createdAt: toISODate(undefined),
    metadata: raw as Record<string, unknown>,
  }
}
