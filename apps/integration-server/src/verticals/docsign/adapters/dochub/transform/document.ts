import type { Document } from '../../../schema/document'

/**
 * DocHub's flat document (`document_flat_resource` in
 * https://dev.dochub.com/api-reference/openapi.yaml), as embedded on
 * GET /api/v2/sign-requests/{id} with `Accept: application/json` and
 * `include=document`. DocHub documents no MIME type, byte size or page count
 * on it, so those canonical fields stay unset. `fullUrl` / `auditUrl` are
 * deliberately not carried: the canonical Document holds no URLs.
 */
export interface RawDochubDocument {
  id: string
  type?: 'documents'
  /** "Document title" */
  title?: string
  subtitle?: string | null
  fullUrl?: string
  auditUrl?: string | null
  isTemplate?: boolean
  createdAt?: string
  updatedAt?: string
  microsoftAttachmentId?: string | null
  signRequestId?: string | null
}

export function transformDocument(raw: RawDochubDocument, envelopeId: string): Document {
  if (typeof raw.title !== 'string') {
    throw new Error(`DocHub document ${raw.id} has no title (documented field "title")`)
  }
  const metadata: Record<string, string> = {}
  if (typeof raw.subtitle === 'string' && raw.subtitle.length > 0) metadata.subtitle = raw.subtitle
  if (typeof raw.isTemplate === 'boolean') metadata.isTemplate = String(raw.isTemplate)
  return {
    id: `${envelopeId}:${raw.id}`,
    externalId: raw.id,
    envelopeId,
    name: raw.title,
    // A sign request has exactly one document (the singular `document`
    // relationship / `documentId`), so it is always position 0.
    order: 0,
    platform: 'dochub',
    metadata,
    raw,
  }
}
