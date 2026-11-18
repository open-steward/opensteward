/**
 * Transform an Artia Activity into the canonical Task shape.
 *
 * In Artia, "Activities" are the atomic work units inside a folder.
 * Key fields from the Artia GraphQL response:
 *   id, title, description, status, customStatus, estimatedStart,
 *   estimatedEnd, createdAt, updatedAt, responsible (user), parent (activity),
 *   folderId, accountId, communityId, createdById, createdForUser
 *
 * Status mapping:
 *   Artia `status` is a string enum. Common values (from the API):
 *     "open"       → open
 *     "doing"      → in_progress
 *     "done"       → closed
 *     "cancelled"  → cancelled
 *   Unknown values fall through to "open".
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawArtiaCustomStatus {
  id?: string | number
  statusName?: string
  status?: string | null
}

export interface RawArtiaUser {
  id?: string | number
  name?: string
  email?: string
}

export interface RawArtiaParent {
  id?: string | number
  name?: string
}

export interface RawArtiaActivity {
  id: string | number
  title?: string
  description?: string
  status?: string | null
  customStatus?: RawArtiaCustomStatus | null
  estimatedStart?: string | null
  estimatedEnd?: string | null
  createdAt?: string
  updatedAt?: string
  responsible?: RawArtiaUser | null
  parent?: RawArtiaParent | null
  folderId?: string | number | null
  accountId?: string | number | null
  communityId?: string | number | null
  createdById?: string | number | null
  createdForUser?: string | number | null
  [key: string]: unknown
}

function mapStatus(raw: RawArtiaActivity): TaskStatus {
  const s = (raw.status ?? raw.customStatus?.status ?? '').toString().toLowerCase()
  if (s === 'done' || s === 'closed' || s === 'completed' || s === 'finished') return 'closed'
  if (s === 'doing' || s === 'in_progress' || s === 'in progress') return 'in_progress'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'open'
}

export function transformTask(raw: RawArtiaActivity, projectId?: string): Task {
  const id = String(raw.id)
  const pid = projectId ?? (raw.folderId != null ? String(raw.folderId) : '')
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.parent?.id != null ? String(raw.parent.id) : undefined,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.estimatedEnd),
    assigneeIds: raw.responsible?.id != null ? [String(raw.responsible.id)] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'artia',
    metadata: strMap({
      rawStatus: raw.status,
      customStatusName: raw.customStatus?.statusName,
      communityId: raw.communityId,
      createdById: raw.createdById,
      isSubtask: raw.parent != null ? 'true' : undefined,
    }),
    raw,
  }
}
