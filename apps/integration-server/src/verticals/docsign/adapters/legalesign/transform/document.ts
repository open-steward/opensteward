import type { Document } from '../../../schema/document'
import { idFromUri, pickStr, strMap, toIso } from './shared'
import type { RawLegalesignDocument } from './envelope'

/**
 * Legalesign composes one signing PDF per document — there is no per-file
 * manifest endpoint. We therefore surface a single canonical Document per
 * Legalesign document, derived from the document object itself. The file
 * body is never exposed: the canonical Document schema has no content field,
 * and Legalesign's binary endpoints (`/pdf/`, `/auditlog/`) are not wired.
 *
 * `hash_value` (the SHA-256 of the final PDF) is surfaced under metadata so
 * downstream consumers can validate a PDF they downloaded out-of-band.
 */
export function transformDocument(raw: RawLegalesignDocument): Document {
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    envelopeId: raw.uuid,
    name: pickStr(raw.name) ?? `${raw.uuid}.pdf`,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'legalesign',
    metadata: strMap({
      hashValue: raw.hash_value,
      group: idFromUri(raw.group),
      createdAt: toIso(raw.created),
      modifiedAt: toIso(raw.modified),
    }),
    raw,
  }
}
