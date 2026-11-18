import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * `FileInformation` from the Document Process API v2 OpenAPI: `id` (required),
 * filename, description, version, modificationTime, filePurpose, mimeType.
 */
export interface RawAutentiFile {
  id: string
  filename?: string
  description?: string | null
  version?: string
  modificationTime?: string | null
  filePurpose?: string
  mimeType?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawAutentiFile,
  envelopeId: string,
  order: number,
): Document {
  const id = pickStr(raw.id)
  if (!id) throw new Error(`Autenti file of document process ${envelopeId} has no id`)
  const name = pickStr(raw.filename)
  if (name === undefined) throw new Error(`Autenti file ${id} has no filename`)
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    mimeType: pickStr(raw.mimeType),
    order,
    platform: 'autenti',
    metadata: strMap({ filePurpose: raw.filePurpose, version: raw.version }),
    raw,
  }
}
