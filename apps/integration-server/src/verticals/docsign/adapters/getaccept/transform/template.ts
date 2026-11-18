import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * GetAccept template (from `/templates`).
 */
export interface RawGetAcceptTemplate {
  id?: string
  name?: string
  description?: string
  created_at?: string
  modified_at?: string
  roles?: Array<{ role?: string; name?: string }>
  recipients?: Array<{ role?: string; first_name?: string; last_name?: string }>
  is_active?: boolean
  is_locked?: boolean
  type?: string
  document_total_pages?: number | string
  page_count?: number | string
  category?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawGetAcceptTemplate): Template {
  const id = pickStr(raw.id) ?? ''
  const roles = (raw.roles ?? raw.recipients ?? [])
    .map((r) => r.role)
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: roles,
    documentCount: pickNum(raw.document_total_pages ?? raw.page_count) ?? 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'getaccept',
    metadata: strMap({
      type: raw.type,
      isActive: raw.is_active,
      category: raw.category,
    }),
    raw,
  }
}
