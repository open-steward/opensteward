import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawClicksignTemplate {
  key: string
  name?: string
  description?: string
  created_at?: string
  updated_at?: string
  signer_roles?: string[]
  fields?: unknown
  [key: string]: unknown
}

export function transformTemplate(raw: RawClicksignTemplate): Template {
  return {
    id: raw.key,
    externalId: raw.key,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: Array.isArray(raw.signer_roles)
      ? raw.signer_roles.filter((r): r is string => typeof r === 'string')
      : [],
    documentCount: 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'clicksign',
    metadata: strMap({}),
    raw,
  }
}
