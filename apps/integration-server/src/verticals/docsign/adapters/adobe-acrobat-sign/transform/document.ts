import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

export interface RawAdobeSignDocument {
  id: string
  name?: string
  numPages?: number
  mimeType?: string
  label?: string
  documentId?: string
  size?: number
  [key: string]: unknown
}

export function transformDocument(
  raw: RawAdobeSignDocument,
  envelopeId: string,
  order: number,
): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    name: pickStr(raw.name) ?? pickStr(raw.label) ?? `document-${order}`,
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.numPages),
    mimeType: pickStr(raw.mimeType),
    order,
    platform: 'adobe-acrobat-sign',
    metadata: strMap({ label: raw.label }),
    raw,
  }
}
