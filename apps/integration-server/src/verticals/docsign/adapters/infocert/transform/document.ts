/**
 * GoSign5 `Document` (an item of `Dossier.documents`) → canonical Document.
 *
 * The GoSign5 OpenAPI (https://devportal.infocert.digital/gosign/documentation/GoSign5)
 * marks `required: [mimeType, originalFilename, title, externalId]` on
 * `Document`. It documents no file size.
 */
import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawGoSign5Document } from './envelope'

/**
 * @param order position of the document in `Dossier.documents` (0-indexed).
 *   The upstream `order` ("Represents the position in the Dossier") does not
 *   say where it counts from, so it is kept in `metadata.gosignOrder`.
 */
export function transformDocument(
  raw: RawGoSign5Document,
  envelopeId: string,
  order: number,
): Document {
  const id = pickStr(raw.externalId)
  if (!id) throw new Error(`infocert: GoSign5 Document in dossier ${envelopeId} has no externalId`)
  const name = pickStr(raw.originalFilename)
  if (!name) throw new Error(`infocert: GoSign5 Document ${id} has no originalFilename`)
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    pageCount: pickNum(raw.numberPages),
    mimeType: pickStr(raw.mimeType),
    order,
    platform: 'infocert',
    metadata: strMap({
      title: raw.title,
      fileStatus: raw.fileStatus,
      visibilityLevel: raw.visibilityLevel,
      gosignOrder: raw.order,
      createdAt: raw.createdAt,
    }),
    raw,
  }
}
