import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Inkit template (a document template that renders to a generated
 * document). Shape per GET /template and GET /template/{templateId}.
 *
 * Inkit templates have no notion of signer roles (it is a generation
 * platform, not an e-signature workflow), so `signerRoles` is always
 * empty and `documentCount` is fixed at 1 — one template renders one
 * document. The template's merge variables are surfaced as metadata.
 */
export interface RawInkitTemplate {
  id: string
  name?: string
  description?: string | null
  source?: string
  version?: number
  merge_variables?: Record<string, unknown>
  height?: number
  width?: number
  unit?: string
  created_by?: { id?: string; name?: string }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawInkitTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: [],
    documentCount: 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'inkit',
    metadata: strMap({
      source: raw.source,
      version: raw.version,
      mergeVariables: raw.merge_variables ? Object.keys(raw.merge_variables).join(',') : undefined,
      createdBy: raw.created_by?.name,
    }),
    raw,
  }
}
