import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Box Sign template (from `/sign_templates`). The template's signers list
 * carries pre-named role placeholders.
 */
export interface RawBoxSignTemplate {
  id?: string
  type?: string
  name?: string
  parent_folder?: { id?: string; name?: string }
  source_files?: Array<{ id?: string; name?: string }>
  signers?: Array<{ role?: string; email?: string; name?: string }>
  email_subject?: string
  email_message?: string
  created_at?: string
  modified_at?: string
  days_valid?: number
  [key: string]: unknown
}

export function transformTemplate(raw: RawBoxSignTemplate): Template {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.email_subject) ?? pickStr(raw.email_message),
    signerRoles: (raw.signers ?? [])
      .map((s) => s.role)
      .filter((r): r is string => typeof r === 'string' && r.length > 0),
    documentCount: Array.isArray(raw.source_files) ? raw.source_files.length : 0,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'box-sign',
    metadata: strMap({
      parentFolderId: raw.parent_folder?.id,
      daysValid: raw.days_valid,
    }),
    raw,
  }
}
