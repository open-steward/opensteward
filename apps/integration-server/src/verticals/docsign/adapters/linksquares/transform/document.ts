import type { Document } from '../../../schema/document'
import { strMap } from './shared'

/**
 * One item of `data[]` from "List Agreement Versions"
 * (GET /finalize/v2/agreements/{agreement_id}/agreement_versions), as the
 * LinkSquares OpenAPI (https://linksquares.com/api/openapi) documents it.
 * These five properties are the whole documented shape, and all are required:
 *
 *   id          "The UUID of the agreement version."
 *   file_name   "The name of the agreement version file." (example "LinkSquares_NDA.docx")
 *   status_id   "The UUID of the agreement version's current status."
 *   created_at  "The ISO 8601 datetime of when the agreement version was created."
 *   deleted_at  "...Expected to be null if not deleted."
 */
export interface RawLinksquaresAgreementVersion {
  id: string
  file_name: string
  status_id: string
  created_at: string
  deleted_at: string | null
}

/**
 * Map an agreement version onto the canonical Document (metadata only —
 * content is REFUSED at the schema level).
 *
 * The canonical id is `<agreementId>:<versionId>`: a version is addressed
 * under its agreement, and `getDocument` receives nothing else. Size, page
 * count and MIME type are not documented on a version, so they stay absent.
 * `order` is the version's position in the list the platform returned.
 */
export function transformDocument(
  raw: RawLinksquaresAgreementVersion,
  envelopeId: string,
  order: number,
): Document {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error(`LinkSquares agreement version on agreement ${envelopeId} has no id`)
  }
  if (typeof raw.file_name !== 'string' || raw.file_name === '') {
    throw new Error(`LinkSquares agreement version ${raw.id} has no file_name`)
  }
  return {
    id: `${envelopeId}:${raw.id}`,
    externalId: raw.id,
    envelopeId,
    name: raw.file_name,
    order,
    platform: 'linksquares',
    metadata: strMap({
      status_id: raw.status_id,
      created_at: raw.created_at,
      deleted_at: raw.deleted_at,
    }),
    raw,
  }
}
