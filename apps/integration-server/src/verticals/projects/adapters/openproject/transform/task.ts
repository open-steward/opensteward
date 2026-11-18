import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso, linkId, linkTitle, type HalLink } from './shared'

interface Formattable {
  format?: string
  raw?: string | null
  html?: string | null
}

/** Status sub-resource embedded under `_embedded.status`, when present. */
interface EmbeddedStatus {
  name?: string
  isClosed?: boolean
}

/**
 * HAL+JSON WorkPackage resource = canonical Task. A work package's project,
 * status, priority, assignee, parent and type are all `_links` (resolved via
 * the trailing id). `percentageDone` is 0–100. `_embedded.status.isClosed`
 * is the authoritative open/closed flag when the collection embeds it.
 */
export interface RawOpenProjectWorkPackage {
  _type?: string
  id?: number | string
  subject?: string
  description?: Formattable | null
  startDate?: string | null
  dueDate?: string | null
  percentageDone?: number | null
  createdAt?: string
  updatedAt?: string
  _links?: {
    self?: HalLink
    project?: HalLink
    status?: HalLink
    priority?: HalLink
    assignee?: HalLink
    parent?: HalLink
    type?: HalLink
    category?: HalLink
  }
  _embedded?: {
    status?: EmbeddedStatus
  }
  [key: string]: unknown
}

function mapStatus(raw: RawOpenProjectWorkPackage): TaskStatus {
  const embedded = raw._embedded?.status
  if (embedded?.isClosed === true) return 'closed'
  const title = (embedded?.name ?? linkTitle(raw._links?.status) ?? '').toLowerCase()
  if (title.includes('progress')) return 'in_progress'
  if (title.includes('review') || title.includes('test')) return 'in_review'
  if (title.includes('rejected') || title.includes('cancel')) return 'cancelled'
  if (title === 'closed' || title === 'done' || title === 'resolved' || title === 'closed.') {
    return 'closed'
  }
  if (typeof raw.percentageDone === 'number' && raw.percentageDone >= 100) return 'closed'
  if (typeof raw.percentageDone === 'number' && raw.percentageDone > 0) return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawOpenProjectWorkPackage): TaskPriority | undefined {
  const v = (linkTitle(raw._links?.priority) ?? '').toLowerCase()
  if (!v) return undefined
  if (v.includes('immediate') || v.includes('urgent') || v.includes('critical')) return 'urgent'
  if (v.includes('high')) return 'high'
  if (v.includes('normal') || v.includes('medium')) return 'medium'
  if (v.includes('low')) return 'low'
  return undefined
}

export function transformTask(
  raw: RawOpenProjectWorkPackage,
  projectId?: string,
): Task {
  const id = pickStr(raw.id) ?? ''
  const pid = projectId ?? linkId(raw._links?.project) ?? ''
  const assignee = linkId(raw._links?.assignee)
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: linkId(raw._links?.parent),
    title: pickStr(raw.subject) ?? '',
    description: pickStr(raw.description?.raw),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.dueDate),
    assigneeIds: assignee ? [assignee] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'openproject',
    metadata: strMap({
      platformType: raw._links?.parent?.href ? 'child' : 'work_package',
      type: linkTitle(raw._links?.type),
      typeId: linkId(raw._links?.type),
      category: linkTitle(raw._links?.category),
      statusTitle: linkTitle(raw._links?.status),
      startDate: raw.startDate ?? undefined,
      percentageDone:
        typeof raw.percentageDone === 'number' ? raw.percentageDone : undefined,
    }),
    raw,
  }
}
