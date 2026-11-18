import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * OneSpan Sign template — a package with `type=TEMPLATE`. Role names come
 * from the package's `roles[]`.
 */
export interface RawOneSpanTemplate {
  id?: string
  name?: string
  description?: string
  type?: string
  language?: string
  created?: string
  updated?: string
  roles?: Array<{ name?: string; type?: string }>
  documents?: Array<{ id?: string; name?: string }>
  [key: string]: unknown
}

export function transformTemplate(raw: RawOneSpanTemplate): Template {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.roles ?? [])
      .map((r) => r.name)
      .filter((r): r is string => typeof r === 'string' && r.length > 0),
    documentCount: Array.isArray(raw.documents) ? raw.documents.length : 0,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'onespan-sign',
    metadata: strMap({
      type: raw.type,
      language: raw.language,
    }),
    raw,
  }
}
