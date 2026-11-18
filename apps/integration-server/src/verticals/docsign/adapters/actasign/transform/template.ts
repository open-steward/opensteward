import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * actaSIGN template → canonical Template.
 *
 * A template pre-defines signatory roles and the document set for a reusable
 * signing process. `signatory_roles[].name` becomes the canonical role list.
 */
export interface RawActasignTemplate {
  id: string
  name?: string
  description?: string
  signature_level?: string
  signatory_roles?: Array<{ name?: string; order?: number }>
  document_count?: number
  documents?: Array<{ id: string }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawActasignTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.signatory_roles ?? [])
      .map((r) => r.name)
      .filter((r): r is string => typeof r === 'string'),
    documentCount:
      raw.document_count ?? (Array.isArray(raw.documents) ? raw.documents.length : 0),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'actasign',
    metadata: strMap({ signatureLevel: raw.signature_level }),
    raw,
  }
}
