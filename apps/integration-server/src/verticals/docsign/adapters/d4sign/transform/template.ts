import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawD4SignTemplate {
  uuid?: string
  uuid_template?: string
  name_template?: string
  name?: string
  description?: string
  created?: string
  updated?: string
  signer_roles?: string[]
  [key: string]: unknown
}

export function transformTemplate(raw: RawD4SignTemplate): Template {
  const id = raw.uuid ?? raw.uuid_template ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name_template) ?? pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: Array.isArray(raw.signer_roles)
      ? raw.signer_roles.filter((r): r is string => typeof r === 'string')
      : [],
    documentCount: 1,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'd4sign',
    metadata: strMap({}),
    raw,
  }
}
