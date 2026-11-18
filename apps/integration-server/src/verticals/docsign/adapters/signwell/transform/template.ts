import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * SignWell template (from `/document_templates`). Roles are pre-named
 * recipient slots.
 */
export interface RawSignWellTemplate {
  id?: string
  name?: string
  subject?: string
  message?: string
  created_at?: string
  updated_at?: string
  is_archived?: boolean
  number_of_pages?: number | string
  number_of_documents?: number | string
  user_id?: string
  account_id?: string
  recipients?: Array<{
    id?: string
    role?: string
    placeholder_name?: string
    placeholder_email?: string
  }>
  [key: string]: unknown
}

export function transformTemplate(raw: RawSignWellTemplate): Template {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.subject) ?? pickStr(raw.message),
    signerRoles: (raw.recipients ?? [])
      .map((r) => r.role ?? r.placeholder_name)
      .filter((r): r is string => typeof r === 'string' && r.length > 0),
    documentCount: pickNum(raw.number_of_documents) ?? 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'signwell',
    metadata: strMap({
      isArchived: raw.is_archived,
      numberOfPages: raw.number_of_pages,
    }),
    raw,
  }
}
