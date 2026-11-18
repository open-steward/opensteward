import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawLealosTemplate {
  id: string
  name?: string
  description?: string
  created_at?: string
  updated_at?: string
  signer_roles?: string[]
  [key: string]: unknown
}

export function transformTemplate(raw: RawLealosTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: Array.isArray(raw.signer_roles)
      ? raw.signer_roles.filter((r): r is string => typeof r === 'string')
      : [],
    documentCount: 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'lealos',
    metadata: strMap({}),
    raw,
  }
}
