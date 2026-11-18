import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * A single document returned by
 * POST api.dhl.com/freight/shipping/labels/v1/print/printdocumentsbyid
 * (DHL Freight Print API — 2026/R03 product manual).
 * All documents are returned as base64-encoded content.
 */
export interface DhlFreightLabelDocument {
  shipmentId: string
  documentType: string | null
  format: string | null
  content: string | null   // base64-encoded PDF/barcode
  url: string | null
  status: string | null
  createdAt: string | null
  [key: string]: unknown
}

/**
 * Top-level response from the Print API.
 */
export interface DhlFreightPrintResponse {
  documents: DhlFreightLabelDocument[]
}

function mapLabelStatus(status: string | null): LabelStatus {
  const key = (status ?? '').toLowerCase()
  switch (key) {
    case 'created':
    case 'success':   return 'CREATED'
    case 'used':      return 'USED'
    case 'refunded':  return 'REFUNDED'
    case 'voided':
    case 'cancelled':
    case 'canceled':  return 'VOIDED'
    default:          return 'UNKNOWN'
  }
}

export function transformLabel(raw: DhlFreightLabelDocument): Label {
  return {
    shipmentId: raw.shipmentId,
    carrierId: 'dhl-freight',
    format: raw.format?.toUpperCase() === 'PDF' ? 'PDF' : 'UNKNOWN',
    status: mapLabelStatus(raw.status),
    url: raw.url ?? undefined,
    base64: raw.content ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
