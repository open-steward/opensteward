/**
 * Signaturit document item → canonical Document (metadata only).
 *
 * The item's documented "file — The file information": `name`, `pages`,
 * `size`. No MIME type is documented, so none is reported. `size` is
 * documented only as "The file size", with no unit, so it is kept in
 * metadata as given rather than reported as `sizeBytes`.
 */
import type { Document } from '../../../schema/document'
import { itemKey, type RawSignaturitDocumentItem } from './envelope'
import { pickNum, pickStr, requireStr } from './shared'

export function transformDocument(
  raw: RawSignaturitDocumentItem,
  envelopeId: string,
  order: number,
): Document {
  const itemId = requireStr(raw.id, 'document id')
  const metadata: Record<string, string> = {}
  const status = pickStr(raw.status)
  if (status) metadata['status'] = status
  const email = pickStr(raw.email)
  if (email) metadata['signerEmail'] = email
  const size = pickNum(raw.file?.size)
  if (size !== undefined) metadata['fileSize'] = String(size)
  return {
    id: itemKey(envelopeId, itemId),
    externalId: itemId,
    envelopeId,
    name: requireStr(raw.file?.name, `file name on document ${itemId}`),
    pageCount: pickNum(raw.file?.pages),
    order,
    platform: 'signaturit',
    metadata,
    raw,
  }
}
