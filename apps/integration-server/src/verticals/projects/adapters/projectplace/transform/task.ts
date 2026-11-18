import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Projectplace card. Cards live on a board (`board_id`) inside a project and
 * are grouped under planning activities (`planlet_id`). Returned by
 * `GET /1/boards/{board_id}/cards` and `GET /1/cards/{id}`.
 *
 * `due_date` / `start_date` are calendar dates (`YYYY-MM-DD`);
 * `created_time` / `modified_time` are Unix epoch seconds.
 */
export interface RawProjectplaceCard {
  id: number | string
  title?: string
  description?: string
  due_date?: string | null
  start_date?: string | null
  is_done?: boolean
  done?: boolean
  display_order?: number
  board_id?: number | string
  planlet_id?: number | string | null
  project_id?: number | string
  assignee?: { id: number | string; name?: string } | null
  assignee_id?: number | string | null
  label?: { id: number | string; name?: string } | null
  label_id?: number | string | null
  comment_count?: number
  created_time?: number | string
  modified_time?: number | string
  [key: string]: unknown
}

/** Epoch-seconds → ISO. */
function epochToIso(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return toIso(new Date(v * 1000).toISOString())
  if (typeof v === 'string' && /^\d+$/.test(v)) return toIso(new Date(Number(v) * 1000).toISOString())
  return toIso(v)
}

function mapStatus(raw: RawProjectplaceCard): TaskStatus {
  if (raw.is_done || raw.done) return 'closed'
  return 'open'
}

export function transformTask(raw: RawProjectplaceCard, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.project_id) ?? ''
  const assigneeId = raw.assignee?.id ?? raw.assignee_id
  const labelId = raw.label?.id ?? raw.label_id
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    parentId: pickStr(raw.planlet_id),
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: assigneeId != null ? [String(assigneeId)] : [],
    tagIds: labelId != null ? [String(labelId)] : [],
    subtaskCount: undefined,
    createdAt: epochToIso(raw.created_time),
    updatedAt: epochToIso(raw.modified_time),
    platform: 'projectplace',
    metadata: strMap({
      platformType: 'card',
      boardId: raw.board_id,
      planletId: raw.planlet_id,
      labelName: raw.label?.name,
      commentCount: raw.comment_count,
    }),
    raw,
  }
}
