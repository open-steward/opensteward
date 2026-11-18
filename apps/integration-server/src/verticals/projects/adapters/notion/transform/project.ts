import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso, richTextToPlain, type NotionRichText } from './shared'

/**
 * Notion has no first-class "project" resource. A data source (the queryable
 * table behind a Notion database) is the closest analogue: it owns a schema, a
 * title, and a set of rows (pages) that map to canonical Tasks.
 */
export interface RawNotionDataSource {
  object?: string
  id: string
  title?: NotionRichText[]
  description?: NotionRichText[]
  parent?: {
    type?: string
    workspace?: boolean
    page_id?: string
    database_id?: string
  }
  is_inline?: boolean
  in_trash?: boolean
  is_archived?: boolean
  created_time?: string
  last_edited_time?: string
  created_by?: { id?: string }
  last_edited_by?: { id?: string }
  url?: string
  [key: string]: unknown
}

function mapStatus(raw: RawNotionDataSource): ProjectStatus {
  if (raw.in_trash || raw.is_archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawNotionDataSource): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // Data sources live under a page/database parent or the workspace; there's
    // no separate workspace id on the object itself.
    workspaceId: raw.parent?.database_id ?? raw.parent?.page_id ?? '',
    name: richTextToPlain(raw.title) ?? '',
    description: richTextToPlain(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.created_by?.id),
    createdAt: toIso(raw.created_time),
    updatedAt: toIso(raw.last_edited_time),
    platform: 'notion',
    metadata: strMap({
      url: raw.url,
      isInline: raw.is_inline,
      parentType: raw.parent?.type,
      lastEditedById: raw.last_edited_by?.id,
    }),
    raw,
  }
}
