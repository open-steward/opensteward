import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * SirionOne contract template — a reusable contract definition with named
 * signatory roles and one or more attached document templates.
 */
export interface RawSirionTemplate {
  contractTemplateId?: string
  templateId?: string
  id?: string
  name?: string
  title?: string
  description?: string
  signatoryRoles?: string[]
  roles?: Array<{ name?: string } | string>
  documentCount?: number
  createdOn?: string
  lastModifiedOn?: string
  [key: string]: unknown
}

function roleNames(raw: RawSirionTemplate): string[] {
  if (Array.isArray(raw.signatoryRoles)) return raw.signatoryRoles.filter((r): r is string => typeof r === 'string')
  if (Array.isArray(raw.roles)) {
    return raw.roles
      .map((r) => (typeof r === 'string' ? r : r?.name))
      .filter((r): r is string => typeof r === 'string' && r.length > 0)
  }
  return []
}

export function transformTemplate(raw: RawSirionTemplate): Template {
  const id = raw.contractTemplateId ?? raw.templateId ?? raw.id ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: roleNames(raw),
    documentCount: pickNum(raw.documentCount) ?? 1,
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.lastModifiedOn),
    platform: 'sirion',
    metadata: strMap({}),
    raw,
  }
}
