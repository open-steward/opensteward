import type { Document } from '../../../schema/document'
import { requireId, requireStr, strMap } from './shared'

/**
 * One entry of an envelope's documented `sources[]`:
 * `{ "id": 400001, "name": "agreement", "type": "original" }`
 * (https://docs.signeasy.com/reference/fetch-envelope-rs-details.md).
 * No size, page count or MIME type is documented, so none is set.
 */
export interface RawSignEasySource {
  id?: number
  name?: string
  type?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSignEasySource,
  envelopeId: string,
  order: number,
): Document {
  const id = requireId(raw.id, 'source id')
  return {
    id,
    externalId: id,
    envelopeId,
    name: requireStr(raw.name, 'source name'),
    order,
    platform: 'signeasy',
    metadata: strMap({ sourceType: raw.type }),
    raw,
  }
}
