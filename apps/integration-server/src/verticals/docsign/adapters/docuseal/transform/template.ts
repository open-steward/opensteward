import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * DocuSeal template — a reusable document with predefined fields and submitter
 * roles. Surfaced as the canonical `Template`.
 */
export interface RawDocusealTemplate {
  id: number
  slug?: string
  name?: string
  preferences?: Record<string, unknown>
  schema?: Array<{ attachment_uuid?: string; name?: string }>
  fields?: Array<{ uuid?: string; name?: string; type?: string }>
  submitters?: Array<{ name?: string; uuid?: string }>
  author_id?: number
  author?: { id?: number; first_name?: string; last_name?: string; email?: string }
  created_at?: string
  updated_at?: string
  archived_at?: string | null
  source?: string
  external_id?: string | null
  folder_id?: number
  folder_name?: string
  shared_link?: boolean
  documents?: Array<{ id?: number; uuid?: string; filename?: string }>
  [key: string]: unknown
}

export function transformTemplate(raw: RawDocusealTemplate): Template {
  const signerRoles = (raw.submitters ?? [])
    .map((s) => s.name)
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
  const documentCount = Array.isArray(raw.documents)
    ? raw.documents.length
    : Array.isArray(raw.schema)
      ? raw.schema.length
      : 0
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    signerRoles,
    documentCount,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'docuseal',
    metadata: strMap({
      slug: raw.slug,
      source: raw.source,
      externalId: raw.external_id,
      folderName: raw.folder_name,
      sharedLink: raw.shared_link,
      fieldCount: Array.isArray(raw.fields) ? raw.fields.length : undefined,
      archivedAt: raw.archived_at,
    }),
    raw,
  }
}
