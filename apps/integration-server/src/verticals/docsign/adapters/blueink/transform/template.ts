import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Blueink Template → canonical Template. Templates (`GET /templates/`) carry
 * an id, a name, optional description, role names, the document list, and
 * created/modified timestamps.
 */
export interface RawBlueinkTemplate {
  id: string
  name?: string
  description?: string
  created?: string
  modified?: string
  roles?: Array<{ role?: string; name?: string } | string>
  documents?: Array<unknown>
  num_documents?: number
  is_test?: boolean
  [key: string]: unknown
}

function roleNames(raw: RawBlueinkTemplate): string[] {
  return (raw.roles ?? [])
    .map((r) => (typeof r === 'string' ? r : (r.role ?? r.name)))
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
}

export function transformTemplate(raw: RawBlueinkTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: roleNames(raw),
    documentCount: Array.isArray(raw.documents)
      ? raw.documents.length
      : (raw.num_documents ?? 0),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.modified),
    platform: 'blueink',
    metadata: strMap({ isTest: raw.is_test }),
    raw,
  }
}
