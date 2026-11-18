import type { Document } from '../../../schema/document'
import { pickStr, strMap, type RawViafirmaMessage } from './shared'

/**
 * Viafirma SET summaries surface their documents at the `message` level:
 * each message is one document presented to a recipient for signing. The
 * summary exposes the message `code`, `title`, `status`, and `templateCode`
 * but no binary size/page metadata (and the schema refuses content anyway).
 */
export function transformDocument(
  raw: RawViafirmaMessage,
  envelopeId: string,
  order: number,
): Document {
  const externalId = raw.code ?? `${envelopeId}:${order}`
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.title) ?? `document-${order}`,
    mimeType: 'application/pdf',
    order,
    platform: 'viafirma',
    metadata: strMap({
      messageCode: raw.code,
      status: raw.status,
      templateCode: raw.templateCode,
    }),
    raw,
  }
}
