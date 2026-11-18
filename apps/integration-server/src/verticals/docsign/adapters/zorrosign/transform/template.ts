import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A reusable ZorroSign template (Z-Fill intelligent form / saved package
 * definition). snake_case on the wire.
 */
export interface RawZorrosignTemplate {
  template_id: string
  name?: string
  title?: string
  description?: string
  created_at?: string
  updated_at?: string
  shared?: boolean
  roles?: Array<{ name?: string; role_name?: string }>
  recipients?: Array<{ role?: string; role_name?: string }>
  documents?: Array<{ document_id?: string }>
  document_count?: string | number
  [key: string]: unknown
}

function roleNames(raw: RawZorrosignTemplate): string[] {
  const fromRoles = (raw.roles ?? []).map((r) => r.name ?? r.role_name)
  const fromRecipients = (raw.recipients ?? []).map((r) => r.role_name ?? r.role)
  return [...fromRoles, ...fromRecipients].filter((r): r is string => typeof r === 'string')
}

export function transformTemplate(raw: RawZorrosignTemplate): Template {
  return {
    id: raw.template_id,
    externalId: raw.template_id,
    name: pickStr(raw.name ?? raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: roleNames(raw),
    documentCount: Array.isArray(raw.documents)
      ? raw.documents.length
      : (pickNum(raw.document_count) ?? 0),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'zorrosign',
    metadata: strMap({ shared: raw.shared }),
    raw,
  }
}
