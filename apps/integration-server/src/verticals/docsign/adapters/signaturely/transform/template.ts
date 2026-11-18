import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * `GET /documents/api/templates` returns `{ data: [...] }` where each row uses
 * the same object shape as a document — a template is a reusable document.
 * Role names come from the template's signer slots; the file count comes from
 * the template's `parts` array.
 */
export interface RawSignaturelyTemplate {
  id: string
  title?: string | null
  message?: string | null
  type?: string
  createdAt?: string
  updatedAt?: string
  signers?: Array<{ role?: string | null; name?: string | null }> | null
  parts?: Array<unknown> | null
  [key: string]: unknown
}

export function transformTemplate(raw: RawSignaturelyTemplate): Template {
  const roles = (raw.signers ?? [])
    .map((s) => pickStr(s.role) ?? pickStr(s.name))
    .filter((r): r is string => typeof r === 'string')
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.message),
    signerRoles: roles,
    documentCount: Array.isArray(raw.parts) ? raw.parts.length : 0,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'signaturely',
    metadata: strMap({ type: raw.type }),
    raw,
  }
}
