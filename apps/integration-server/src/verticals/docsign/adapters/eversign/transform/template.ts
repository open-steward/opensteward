import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawEversignTemplate {
  template_id?: string
  templateId?: string
  document_hash?: string
  title?: string
  message?: string
  description?: string
  created_at?: number | string
  updated_at?: number | string
  signers?: Array<{ role?: string; name?: string }>
  files?: Array<unknown>
  is_draft?: number | boolean
  [key: string]: unknown
}

export function transformTemplate(raw: RawEversignTemplate): Template {
  const id =
    pickStr(raw.template_id) ?? pickStr(raw.templateId) ?? pickStr(raw.document_hash) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description) ?? pickStr(raw.message),
    signerRoles: (raw.signers ?? [])
      .map((s) => pickStr(s.role ?? s.name))
      .filter((r): r is string => Boolean(r)),
    documentCount: pickNum(Array.isArray(raw.files) ? raw.files.length : 0) ?? 0,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'eversign',
    metadata: strMap({ is_draft: raw.is_draft }),
    raw,
  }
}
