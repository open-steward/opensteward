import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawPandaDocTemplate {
  id: string
  name?: string
  date_created?: string
  date_modified?: string
  tags?: string[]
  description?: string
  content_library_items?: Array<unknown>
  roles?: Array<{ name?: string }>
  [key: string]: unknown
}

export function transformTemplate(raw: RawPandaDocTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.roles ?? [])
      .map((r) => r.name)
      .filter((n): n is string => typeof n === 'string'),
    documentCount: 1,
    createdAt: toIso(raw.date_created),
    updatedAt: toIso(raw.date_modified),
    platform: 'pandadoc',
    metadata: strMap({ tags: raw.tags?.join(',') }),
    raw,
  }
}
