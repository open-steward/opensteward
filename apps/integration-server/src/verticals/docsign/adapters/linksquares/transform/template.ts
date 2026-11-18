import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Finalize request-form / agreement template. Templates define the roles
 * (parties) and the document(s) an agreement is drafted from.
 */
export interface RawLinksquaresTemplate {
  id: number | string
  name?: string
  description?: string
  roles?: string[]
  party_roles?: string[]
  document_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawLinksquaresTemplate): Template {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: raw.roles ?? raw.party_roles ?? [],
    documentCount: raw.document_count ?? 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'linksquares',
    metadata: strMap({}),
    raw,
  }
}
