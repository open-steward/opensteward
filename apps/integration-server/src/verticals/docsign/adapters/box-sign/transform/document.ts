import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Box Sign document = one entry of `sign_request.source_files[]`. Each
 * file lives in the user's Box drive and is referenced by id + name. We
 * carry over metadata only.
 */
export interface RawBoxSignSourceFile {
  type?: 'file'
  id?: string
  name?: string
  size?: number | string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawBoxSignSourceFile,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.id) ?? `${envelopeId}:${index}`
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount: undefined,
    mimeType: 'application/pdf',
    order: index,
    platform: 'box-sign',
    metadata: strMap({
      sourceType: raw.type,
    }),
    raw,
  }
}
