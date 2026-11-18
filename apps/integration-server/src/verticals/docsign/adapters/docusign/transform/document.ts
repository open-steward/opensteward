import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

export interface RawDocuSignDocument {
  documentId: string
  documentIdGuid?: string
  name?: string
  type?: string
  uri?: string
  order?: string
  pages?: Array<unknown>
  // DocuSign exposes size on the envelope-document detail endpoint; the list
  // shape sometimes omits it, sometimes includes it as a stringified int.
  size?: string | number
  [key: string]: unknown
}

export function transformDocument(raw: RawDocuSignDocument, envelopeId: string): Document {
  const id = raw.documentIdGuid ?? `${envelopeId}:${raw.documentId}`
  return {
    id,
    externalId: raw.documentId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount: Array.isArray(raw.pages) ? raw.pages.length : undefined,
    mimeType: raw.type === 'pdf' ? 'application/pdf' : pickStr(raw.type),
    order: pickNum(raw.order) ?? 0,
    platform: 'docusign',
    metadata: strMap({ uri: raw.uri }),
    raw,
  }
}
