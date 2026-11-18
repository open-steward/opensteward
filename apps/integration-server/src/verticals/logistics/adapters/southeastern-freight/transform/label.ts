/**
 * Transform SEFL Document Retrieval API responses → canonical Label.
 *
 * SEFL Document Retrieval endpoint:
 *   POST https://www.sefl.com/document-retrieval/
 *   Body: { imageTypes: ["BL"], associated: false, format: "pdf" }
 *   Auth: Basic (username:password)
 *
 * Response envelope (per SEFL Document Retrieval REST Service docs):
 * [
 *   {
 *     pro:         string   // pro number
 *     base64Image: string   // base64-encoded document content
 *     fileExt:     string   // e.g. "pdf"
 *     type:        string   // human-readable type e.g. "Bill of Lading"
 *     error?:      string   // present when retrieval failed
 *   }
 * ]
 *
 * Source: https://www.sefl.com/seflWebsite/documentRetrieval/documentRetrievalRESTService.jsp
 */

import type { Label } from '../../../schema/label'

export interface SeflDocumentItem {
  pro?: string
  base64Image?: string
  fileExt?: string
  type?: string
  error?: string
  [key: string]: unknown
}

export interface SeflDocumentResponse {
  documents?: SeflDocumentItem[]
  [key: string]: unknown
}

/**
 * Transform a single SEFL document retrieval item (imageType "BL") into a
 * canonical Label.  The BOL document is the closest SEFL analogue to a
 * shipping label — it carries the pro number, is in PDF format, and is
 * returned as base64 content.
 */
export function transformLabel(raw: SeflDocumentItem): Label {
  return {
    id: raw.pro ?? undefined,
    trackingNumber: raw.pro ?? undefined,
    carrierId: 'southeastern-freight',
    serviceCode: undefined,
    format: 'PDF',
    status: raw.error ? 'VOIDED' : 'CREATED',
    base64: raw.base64Image ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
