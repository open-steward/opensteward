import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawJuroContract } from './envelope'

/**
 * Juro has no standalone document resource — a contract IS the document.
 * The only file surface is `GET /v3/contracts/:id/pdf/binary`, whose
 * content is REFUSED by the docsign firewall. We therefore synthesize one
 * metadata-only Document per contract (name only; size/pageCount are not
 * exposed by the contract API).
 */
export function transformDocument(
  raw: RawJuroContract,
  envelopeId: string,
): Document {
  return {
    id: envelopeId,
    externalId: envelopeId,
    envelopeId,
    name: `${pickStr(raw.name) ?? 'contract'}.pdf`,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'juro',
    metadata: strMap({
      templateName: raw.template?.name,
      status: raw.status,
    }),
    raw,
  }
}
