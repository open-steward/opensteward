import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * A document entry of "Workflow Info"
 * (GET /api/v2/decision_workflows/:id, https://doc.webdoxclm.com/docs/v2/en/index.html).
 * Only the fields in that documented example are declared. It carries no
 * size and no file type, so neither is emitted.
 */
export interface RawWebdoxDocument {
  id: string
  name?: string | null
  type?: string | null
  in_repository?: boolean | null
  signable?: boolean | null
  signed?: boolean | null
  created_at?: string | null
}

export function transformDocument(
  raw: RawWebdoxDocument,
  envelopeId: string,
  order: number,
): Document {
  const name = pickStr(raw.name)
  // `name` is in the documented example and required canonically. There is no
  // documented substitute, so a document without one is an error, never ''.
  if (!name) throw new Error(`Webdox document ${String(raw.id)} has no name`)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    envelopeId,
    name,
    order,
    platform: 'webdox',
    metadata: strMap({
      type: raw.type,
      inRepository: raw.in_repository,
      signable: raw.signable,
      signed: raw.signed,
      createdAt: raw.created_at,
    }),
    raw,
  }
}
