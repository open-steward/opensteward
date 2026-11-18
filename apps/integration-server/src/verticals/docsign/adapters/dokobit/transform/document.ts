/**
 * Dokobit Portal API file (an element of `files` in GET
 * /api/signing/{token}/status.json, https://beta.dokobit.com/api/doc:
 * `name`, `url`, `type`, `mime_type`) → canonical Document.
 *
 * A file carries no identifier of its own, so its id is the signing token and
 * its position in `files`; getDocument reads it back the same way.
 */
import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

export interface RawDokobitFile {
  name?: string
  url?: string
  type?: string | null
  mime_type?: string | null
}

export function documentId(envelopeId: string, index: number): string {
  return `${envelopeId}:${index}`
}

export function transformDocument(
  raw: RawDokobitFile,
  envelopeId: string,
  order: number,
): Document {
  // files[][name] is a required parameter of POST /api/signing/create.json.
  const name = pickStr(raw.name)
  if (name === undefined) {
    throw new Error(`Dokobit signing ${envelopeId}: file ${order} has no name`)
  }
  const id = documentId(envelopeId, order)
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    mimeType: pickStr(raw.mime_type),
    order,
    platform: 'dokobit',
    metadata: strMap({ type: raw.type }),
    // The download URL stays out: the schema refuses document content.
    raw: { name: raw.name, type: raw.type, mime_type: raw.mime_type },
  }
}
