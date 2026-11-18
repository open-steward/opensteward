import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * eSignly template. Templates are referenced by `template_key` when creating
 * a sign request and define the roles, fields, and signing order once for
 * reuse. Wire shape is snake_case.
 */
export interface RawEsignlyTemplate {
  template_key?: string
  template_id?: string
  name?: string
  title?: string
  description?: string
  subject?: string
  roles?: Array<{ role?: string; name?: string }>
  signer_roles?: string[]
  document_count?: string | number
  documents?: Array<unknown>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function roleNames(raw: RawEsignlyTemplate): string[] {
  if (Array.isArray(raw.signer_roles)) {
    return raw.signer_roles.filter((r): r is string => typeof r === 'string')
  }
  return (raw.roles ?? [])
    .map((r) => pickStr(r.role) ?? pickStr(r.name))
    .filter((r): r is string => typeof r === 'string')
}

export function transformTemplate(raw: RawEsignlyTemplate): Template {
  const id = pickStr(raw.template_key) ?? pickStr(raw.template_id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: roleNames(raw),
    documentCount: Array.isArray(raw.documents)
      ? raw.documents.length
      : (pickNum(raw.document_count) ?? 0),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'esignly',
    metadata: strMap({ subject: raw.subject }),
    raw,
  }
}
