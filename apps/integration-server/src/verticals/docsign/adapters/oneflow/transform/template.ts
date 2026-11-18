import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawOneflowTemplate {
  id: number | string
  name?: string
  description?: string
  created_time?: string
  updated_time?: string
  parties?: Array<{ name?: string }>
  [key: string]: unknown
}

export function transformTemplate(raw: RawOneflowTemplate): Template {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.parties ?? [])
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string'),
    documentCount: 1,
    createdAt: toIso(raw.created_time),
    updatedAt: toIso(raw.updated_time),
    platform: 'oneflow',
    metadata: strMap({}),
    raw,
  }
}
