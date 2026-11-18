import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'

/**
 * A single document entry within `GetShipmentDocumentsResult.packageDocumentDetail.packageDocuments[]`
 * from GET /shipping/v2/shipments/{shipmentId}/documents.
 *
 * Reference: https://developer-docs-amazon-shipping.readme.io/apis/docs/shipping-api-v2-reference
 */
export interface SpApiPackageDocument {
  /** e.g. 'LABEL', 'PACKSLIP', 'RECEIPT', 'CUSTOM_FORM' */
  type?: string | null
  /** e.g. 'PDF', 'PNG', 'ZPL' */
  format?: string | null
  /** Base64-encoded file contents */
  contents?: string | null
  [key: string]: unknown
}

export interface SpApiPackageDocumentDetail {
  packageClientReferenceId?: string | null
  packageDocuments?: SpApiPackageDocument[]
  [key: string]: unknown
}

/**
 * Top-level response from GET /shipping/v2/shipments/{shipmentId}/documents.
 */
export interface SpApiGetShipmentDocumentsResult {
  shipmentId?: string | null
  packageDocumentDetail?: SpApiPackageDocumentDetail | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat {
  switch (format?.toUpperCase()) {
    case 'PDF':
      return 'PDF'
    case 'PNG':
      return 'PNG'
    case 'ZPL':
      return 'ZPL'
    default:
      return 'UNKNOWN' as LabelFormat
  }
}

export function transformLabel(
  raw: SpApiGetShipmentDocumentsResult,
  trackingNumber?: string,
): Label[] {
  const detail = raw.packageDocumentDetail
  const docs = detail?.packageDocuments ?? []

  // Filter to LABEL documents only; fall back to all docs if none typed as LABEL.
  const labelDocs = docs.filter((d) => !d.type || d.type === 'LABEL')
  const source = labelDocs.length > 0 ? labelDocs : docs

  return source.map((doc) => ({
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'amazon-sp-api',
    format: mapLabelFormat(doc.format),
    status: 'CREATED' as LabelStatus,
    base64: doc.contents ?? undefined,
    metadata: { shipmentId: raw.shipmentId, ...doc } as Record<string, unknown>,
  }))
}

/**
 * Convenience: return the first label document from the result, or an empty
 * placeholder when the documents list is absent.
 */
export function transformLabelSingle(
  raw: SpApiGetShipmentDocumentsResult,
  trackingNumber?: string,
): Label {
  const labels = transformLabel(raw, trackingNumber)
  if (labels.length > 0) return labels[0]

  return {
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'amazon-sp-api',
    status: 'CREATED' as LabelStatus,
    metadata: raw as Record<string, unknown>,
  }
}
