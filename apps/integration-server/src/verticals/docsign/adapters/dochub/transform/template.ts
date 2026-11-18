import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * DocHub template — a reusable sign-request blueprint with named recipient
 * roles and one or more documents.
 */
export interface RawDochubTemplate {
  id: string
  name?: string
  title?: string
  description?: string
  created_at?: string
  updated_at?: string
  shared?: boolean
  recipient_roles?: Array<{ name?: string; role?: string }>
  roles?: Array<{ name?: string }>
  documents?: Array<{ id?: string }>
  document_count?: string | number
  [key: string]: unknown
}

function roleNames(raw: RawDochubTemplate): string[] {
  const fromRecipientRoles = (raw.recipient_roles ?? [])
    .map((r) => pickStr(r.name ?? r.role))
    .filter((r): r is string => typeof r === 'string')
  if (fromRecipientRoles.length > 0) return fromRecipientRoles
  return (raw.roles ?? [])
    .map((r) => pickStr(r.name))
    .filter((r): r is string => typeof r === 'string')
}

export function transformTemplate(raw: RawDochubTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name ?? raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: roleNames(raw),
    documentCount: Array.isArray(raw.documents)
      ? raw.documents.length
      : (pickNum(raw.document_count) ?? 0),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'dochub',
    metadata: strMap({ shared: raw.shared }),
    raw,
  }
}
