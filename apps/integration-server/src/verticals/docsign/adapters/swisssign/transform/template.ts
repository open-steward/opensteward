import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawSwissSignTemplate {
  id: string
  name?: string
  description?: string
  signer_roles?: string[]
  document_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawSwissSignTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: raw.signer_roles ?? [],
    documentCount: raw.document_count ?? 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'swisssign',
    metadata: strMap({}),
    raw,
  }
}
