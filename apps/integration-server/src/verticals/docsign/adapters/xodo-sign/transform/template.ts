import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'
import type { RawXodoSignDocument } from './envelope'

/**
 * Xodo Sign templates are documents flagged `is_template`, returned by the
 * document-list endpoint with `type=templates`. The `document_hash` is the
 * template id you later pass as `template_id` when creating a document.
 * Signer roles live in the `signers[].role` field; the file count gives the
 * document count.
 */
export type RawXodoSignTemplate = RawXodoSignDocument

export function transformTemplate(raw: RawXodoSignTemplate): Template {
  return {
    id: raw.document_hash,
    externalId: raw.document_hash,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.message),
    signerRoles: (raw.signers ?? [])
      .map((s) => pickStr(s.role))
      .filter((r): r is string => typeof r === 'string'),
    documentCount: (raw.files ?? []).length,
    createdAt: toIso(raw.created),
    platform: 'xodo-sign',
    metadata: strMap({ templateId: raw.template_id }),
    raw,
  }
}
