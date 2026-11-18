import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { strMap, toIso, richTextToPlain, type NotionRichText } from './shared'

/** A single typed Notion page-property value (only the fields we read). */
interface NotionPropertyValue {
  id?: string
  type?: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  status?: { name?: string } | null
  select?: { name?: string } | null
  multi_select?: Array<{ id?: string; name?: string }>
  people?: Array<{ id?: string }>
  date?: { start?: string; end?: string } | null
  checkbox?: boolean
  [key: string]: unknown
}

/**
 * A Notion page = one row in a data source. Property values are a typed map
 * keyed by the user-defined column name, so the transform locates fields by
 * property `type` rather than by a fixed key.
 */
export interface RawNotionPage {
  object?: string
  id: string
  parent?: { type?: string; data_source_id?: string; database_id?: string; page_id?: string }
  properties?: Record<string, NotionPropertyValue>
  created_time?: string
  last_edited_time?: string
  created_by?: { id?: string }
  last_edited_by?: { id?: string }
  in_trash?: boolean
  is_archived?: boolean
  url?: string
  [key: string]: unknown
}

function props(raw: RawNotionPage): NotionPropertyValue[] {
  return Object.values(raw.properties ?? {})
}

function findByType(raw: RawNotionPage, type: string): NotionPropertyValue | undefined {
  return props(raw).find((p) => p.type === type)
}

function titleText(raw: RawNotionPage): string {
  return richTextToPlain(findByType(raw, 'title')?.title) ?? ''
}

/** Notion has no native status enum; infer from a `status`/`select` column or the checkbox/trash flags. */
function mapStatus(raw: RawNotionPage): TaskStatus {
  if (raw.in_trash || raw.is_archived) return 'cancelled'
  const checkbox = props(raw).find((p) => p.type === 'checkbox' && p.checkbox !== undefined)
  if (checkbox?.checkbox === true) return 'closed'
  const statusName = (
    findByType(raw, 'status')?.status?.name ??
    findByType(raw, 'select')?.select?.name ??
    ''
  ).toLowerCase()
  if (['done', 'complete', 'completed', 'closed', 'shipped'].includes(statusName)) return 'closed'
  if (['cancelled', 'canceled', 'archived', 'wont do', "won't do"].includes(statusName)) return 'cancelled'
  if (['in review', 'review', 'in-review', 'qa', 'testing'].includes(statusName)) return 'in_review'
  if (
    ['in progress', 'in-progress', 'doing', 'started', 'active', 'blocked', 'on hold', 'paused', 'waiting'].includes(
      statusName,
    )
  )
    return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawNotionPage): TaskPriority | undefined {
  // Notion priority is conventionally a select column literally named "Priority".
  const entries = Object.entries(raw.properties ?? {})
  const entry = entries.find(([name]) => name.toLowerCase() === 'priority')
  const value = entry?.[1]
  const v = (value?.select?.name ?? value?.status?.name ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

function dueDate(raw: RawNotionPage): string | undefined {
  const date = findByType(raw, 'date')?.date
  return toIso(date?.start)
}

function assigneeIds(raw: RawNotionPage): string[] {
  const people = findByType(raw, 'people')?.people ?? []
  return people.map((p) => p.id).filter((id): id is string => Boolean(id))
}

function tagIds(raw: RawNotionPage): string[] {
  const tags = findByType(raw, 'multi_select')?.multi_select ?? []
  return tags.map((t) => t.id).filter((id): id is string => Boolean(id))
}

export function transformTask(raw: RawNotionPage, projectId?: string): Task {
  const pid = projectId ?? raw.parent?.data_source_id ?? raw.parent?.database_id ?? ''
  // A page parented by another page (not a data source) is a sub-page.
  const parentId = raw.parent?.type === 'page_id' ? raw.parent.page_id : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId,
    title: titleText(raw),
    description: richTextToPlain(findByType(raw, 'rich_text')?.rich_text),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: dueDate(raw),
    assigneeIds: assigneeIds(raw),
    tagIds: tagIds(raw),
    createdAt: toIso(raw.created_time),
    updatedAt: toIso(raw.last_edited_time),
    platform: 'notion',
    metadata: strMap({
      url: raw.url,
      platformType: parentId ? 'subpage' : 'page',
      parentType: raw.parent?.type,
      lastEditedById: raw.last_edited_by?.id,
    }),
    raw,
  }
}
