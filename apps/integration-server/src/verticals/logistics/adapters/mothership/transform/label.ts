import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * A single document entry from `GET /documents/{shipmentId}`.
 *
 * In LTL freight, Mothership does not issue parcel-style shipping labels.
 * Instead, shipment documents (Bill of Lading, Proof of Delivery, etc.) serve
 * the equivalent role.  The canonical Label is derived from these entries.
 *
 * Source: https://developers.mothership.com/reference/listshipmentdocuments.md
 */
export interface MothershipDocumentRaw {
  /** Document classification, e.g. "BillOfLading", "ProofOfDelivery". */
  type?: string
  /** Presigned URL to download or view the document. */
  url?: string
  /** ISO 8601 datetime at which the download URL expires. */
  expiresAt?: string
  [key: string]: unknown
}

/**
 * Top-level response from `GET /documents/{shipmentId}`.
 */
export interface MothershipDocumentListResponse {
  data?: MothershipDocumentRaw[]
  [key: string]: unknown
}

export function transformLabel(raw: MothershipDocumentRaw, shipmentId: string): Label {
  return {
    // Mothership documents have no own ID; derive from type + shipmentId
    id: raw.type ? `${shipmentId}_${raw.type}` : shipmentId,
    shipmentId,
    carrierId: 'mothership',
    // BOL / freight documents are PDF format
    format: 'PDF',
    status: 'CREATED',
    url: raw.url ?? undefined,
    createdAt: toISODate(raw.expiresAt), // closest available timestamp
    metadata: raw as Record<string, unknown>,
  }
}

export function unwrapDocuments(res: MothershipDocumentListResponse): MothershipDocumentRaw[] {
  return res.data ?? (Array.isArray(res) ? (res as MothershipDocumentRaw[]) : [])
}
