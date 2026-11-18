import type { Document } from '../../../schema/document'
import type { RawIcertisAssociatedDocument } from './envelope'
import { pickNum, pickStr, strMap } from './shared'

export type { RawIcertisAssociatedDocument } from './envelope'

export function transformDocument(
  raw: RawIcertisAssociatedDocument,
  envelopeId: string,
  order: number,
): Document {
  const id = raw.ICMId ?? raw.Id ?? `${envelopeId}:${order}`
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.FileName) ?? pickStr(raw.Name) ?? pickStr(raw.DisplayName) ?? `document-${order}`,
    sizeBytes: pickNum(raw.FileSize) ?? pickNum(raw.Size),
    pageCount: pickNum(raw.PageCount),
    mimeType: pickStr(raw.MimeType) ?? 'application/pdf',
    order,
    platform: 'icertis',
    metadata: strMap({}),
    raw,
  }
}
