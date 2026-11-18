import type { Document } from '../../../schema/document'
import { strMap } from './shared'
import type { RawBlueinkDocument } from './envelope'

/**
 * Blueink bundle document → canonical Document (metadata only). Blueink
 * exposes `key` + `filename` (+ a `file_url` that points at the generated
 * file). Documents are keyed within the bundle, so we address them as
 * `<bundleId>:<order>`. The canonical schema has no content field and we
 * deliberately do NOT surface `file_url` — signed-document content is refused
 * at the wire level.
 */
export function transformDocument(
  raw: RawBlueinkDocument,
  envelopeId: string,
  order: number,
): Document {
  const name = raw.filename ?? raw.key ?? ''
  return {
    id: `${envelopeId}:${order}`,
    externalId: raw.key ?? `${envelopeId}:${order}`,
    envelopeId,
    name,
    mimeType: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined,
    order,
    platform: 'blueink',
    metadata: strMap({
      key: raw.key,
      templateId: raw.template_id,
    }),
    raw,
  }
}
