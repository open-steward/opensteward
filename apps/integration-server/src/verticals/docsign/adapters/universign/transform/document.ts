/**
 * Universign `documents[ ]` of a transaction → canonical Document (metadata
 * only; content is refused by the schema).
 *
 * Fields per "The Transaction object" (https://apps.universign.com/docs/api/):
 * `documents[ ].id` "The document ID." and `documents[ ].name` "The name of
 * the document, if you set any. If not, the file name is used." Universign
 * documents no size, page count or MIME type for them.
 */
import type { Document } from '../../../schema/document'
import { scopedId } from './shared'
import type { RawUniversignDocument } from './types'

export function transformDocument(
  raw: RawUniversignDocument,
  transactionId: string,
  order: number,
): Document {
  return {
    id: scopedId(transactionId, raw.id),
    externalId: raw.id,
    envelopeId: transactionId,
    name: raw.name,
    order,
    platform: 'universign',
    metadata: {},
    raw,
  }
}
