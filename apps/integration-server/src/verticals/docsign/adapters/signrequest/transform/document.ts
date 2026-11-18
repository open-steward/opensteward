import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawSignRequestDocument } from './envelope'

/**
 * SignRequest stores exactly one file per document object, so each canonical
 * Envelope owns a single canonical Document at order 0. Only metadata is
 * surfaced — the binary (`pdf` / `file_as_pdf` download URLs) is never read,
 * matching the docsign schema's content firewall.
 */
export function transformDocument(raw: RawSignRequestDocument): Document {
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    envelopeId: raw.uuid,
    name: pickStr(raw.name) ?? `${raw.uuid}.pdf`,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'signrequest',
    metadata: strMap({
      status: raw.status,
      externalId: raw.external_id,
      frontendId: raw.frontend_id,
      securityHash: raw.security_hash,
    }),
    raw,
  }
}
