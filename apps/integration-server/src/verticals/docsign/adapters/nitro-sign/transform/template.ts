import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawNitroSignTemplate {
  id?: string
  templateId?: string
  name?: string
  description?: string
  createdAt?: string
  updatedAt?: string
  signers?: Array<{ role?: string; roleName?: string }>
  roles?: Array<{ role?: string; name?: string }>
  documents?: Array<unknown>
  documentCount?: number | string
  shared?: boolean | string
  [key: string]: unknown
}

export function transformTemplate(raw: RawNitroSignTemplate): Template {
  const id = pickStr(raw.id) ?? pickStr(raw.templateId) ?? ''
  const roles =
    (raw.signers ?? [])
      .map((s) => pickStr(s.role ?? s.roleName))
      .filter((r): r is string => Boolean(r))
  const fallbackRoles = (raw.roles ?? [])
    .map((r) => pickStr(r.role ?? r.name))
    .filter((r): r is string => Boolean(r))
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: roles.length > 0 ? roles : fallbackRoles,
    documentCount:
      pickNum(raw.documentCount) ??
      (Array.isArray(raw.documents) ? raw.documents.length : 0),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'nitro-sign',
    metadata: strMap({ shared: raw.shared }),
    raw,
  }
}
