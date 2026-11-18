/**
 * Concord attachment -> canonical Document (metadata only).
 *
 * GET /organizations/{organizationId}/agreements/{agreementUid}/attachments
 * ("List the attachments") answers Listtheattachmentsresponse
 * `{ attachments: Attachment[] }`, and an Attachment is
 * (https://api.doc.concordnow.com/concord-openapi-bundled.yaml):
 *   required: fileName, name, description, url, id
 *   properties: id (string), uid, fileName, name, description, origin,
 *   hasPreview, url, data, createdAt (date-time), createdBy (UserDto)
 *
 * `url` and `data` point at or carry the file itself: they are refused and
 * never reach `raw`. No size, page count or MIME type is documented.
 */
import type { Document } from '../../../schema/document'
import { dateTimeToIso, requireStr, strMap } from './shared'

export interface RawConcordAttachment {
  id: string
  fileName: string
  name?: string
  description?: string
  origin?: string
  hasPreview?: boolean
  url?: string
  data?: string
  createdAt?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawConcordAttachment,
  envelopeId: string,
  order: number,
): Document {
  const id = requireStr(raw.id, `attachment on ${envelopeId} id`)
  const { url: _url, data: _data, ...safe } = raw
  return {
    id,
    externalId: id,
    envelopeId,
    name: requireStr(raw.fileName, `attachment ${id} fileName`),
    order,
    platform: 'concord',
    metadata: strMap({
      title: raw.name,
      description: raw.description,
      origin: raw.origin,
      createdAt: dateTimeToIso(raw.createdAt),
    }),
    raw: safe,
  }
}
