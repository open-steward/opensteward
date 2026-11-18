import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Zoho Sign template (from /templates). Roles live inside `actions[]`
 * exactly like requests.
 */
export interface RawZohoSignTemplate {
  template_id?: string
  template_name?: string
  description?: string
  created_time?: number | string
  modified_time?: number | string
  owner_id?: string
  owner_email?: string
  actions?: Array<{ role_name?: string; recipient_name?: string }>
  documents?: Array<{ document_id?: string }>
  document_ids?: Array<{ document_id?: string }>
  document_fields?: Array<unknown>
  template_type?: string
  is_template_sharable?: boolean
  total_pages?: string | number
  [key: string]: unknown
}

export function transformTemplate(raw: RawZohoSignTemplate): Template {
  const id = pickStr(raw.template_id) ?? ''
  const docs = (raw.documents ?? raw.document_ids ?? []).length
  return {
    id,
    externalId: id,
    name: pickStr(raw.template_name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.actions ?? [])
      .map((a) => a.role_name ?? a.recipient_name)
      .filter((r): r is string => typeof r === 'string' && r.length > 0),
    documentCount: docs > 0 ? docs : (pickNum(raw.total_pages) ?? 0),
    createdAt: toIso(raw.created_time),
    updatedAt: toIso(raw.modified_time),
    platform: 'zoho-sign',
    metadata: strMap({
      ownerEmail: raw.owner_email,
      templateType: raw.template_type,
      shared: raw.is_template_sharable,
    }),
    raw,
  }
}
