import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw shape returned by the Proof `GET /v1/templates` endpoint.
 *
 * Docs: https://dev.proof.com/reference/getalltemplates
 *
 * The list response envelope is `{ total_count: number, templates: RawProofTemplate[] }`.
 * Note: the API is documented as "Business only" — only accounts on a Business
 * plan expose this endpoint.
 */
export interface RawProofTemplate {
  id?: string
  created_at?: string
  updated_at?: string
  permalink?: string
  name?: string
  [key: string]: unknown
}

export interface ProofTemplateListResponse {
  templates?: RawProofTemplate[]
  total_count?: number
}

export function transformTemplate(raw: RawProofTemplate): Template {
  const id = pickStr(raw.id) ?? pickStr(raw.permalink) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: undefined,
    signerRoles: [],
    documentCount: 0,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'proof',
    metadata: strMap({
      permalink: raw.permalink,
    }),
    raw,
  }
}
