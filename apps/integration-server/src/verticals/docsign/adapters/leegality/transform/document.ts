import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * Leegality returns `data.files[]` as an array of file names on the
 * Details API. Each entry becomes one canonical Document — name +
 * position only. The base64 PDF body (`file`) and the audit-trail blob
 * are REFUSED: this transform never reads document content.
 */
export function transformDocument(
  fileName: string,
  envelopeId: string,
  index: number,
): Document {
  const id = `${envelopeId}:${index}`
  const name = pickStr(fileName) ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    mimeType: 'application/pdf',
    order: index,
    platform: 'leegality',
    metadata: strMap({ fileName: name }),
    raw: { fileName: name, index },
  }
}
