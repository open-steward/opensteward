import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// Derived from the POST /shipping/bol/create response envelope.
// The Shipping API returns label/BOL documents in detail.documents.image[].
// Reference: TForce Freight Shipping API User Manual (July 2025), §Shipping Response
// Properties (Document Details) — detail.documents.image[].type / .format / .data

export interface TforceDocumentImage {
  status: string | null
  type: string | null   // document type code, e.g. '30' = label
  format: string | null // '01' = PDF
  data: string | null   // base64-encoded document content
  [key: string]: unknown
}

export interface TforceBolDetailDocuments {
  image: TforceDocumentImage[] | null
  [key: string]: unknown
}

export interface TforceBolDetail {
  bolId: number | null
  pro: string | null
  documents: TforceBolDetailDocuments | null
  [key: string]: unknown
}

export interface TforceBolResponse {
  detail: TforceBolDetail | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null): Label['format'] {
  if (!format) return undefined
  switch (format.toUpperCase()) {
    case '01':
    case 'PDF':
      return 'PDF'
    case 'PNG':
      return 'PNG'
    case 'ZPL':
      return 'ZPL'
    default:
      return undefined
  }
}

export function transformLabel(raw: TforceDocumentImage, bolDetail: TforceBolDetail): Label {
  return {
    id: bolDetail.bolId != null ? String(bolDetail.bolId) : undefined,
    shipmentId: bolDetail.bolId != null ? String(bolDetail.bolId) : undefined,
    trackingNumber: bolDetail.pro ?? undefined,
    carrierId: 'tforce-freight',
    format: mapLabelFormat(raw.format),
    status: 'CREATED',
    base64: raw.data ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformLabelsFromBolResponse(raw: TforceBolResponse): Label[] {
  const detail = raw.detail
  if (!detail) return []
  const images = detail.documents?.image ?? []
  if (images.length === 0) return []
  return images
    .filter((img) => img.data != null)
    .map((img) => transformLabel(img, detail))
}
