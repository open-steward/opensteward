import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Redmine issue journal entry — represents a comment or change note.
 *
 * Journals are embedded in the issue response when `include=journals` is
 * passed. Only entries with a non-empty `notes` field are treated as comments.
 *
 * Relevant fields:
 *   id          - numeric journal id
 *   user        - { id, name }
 *   notes       - comment body (may be empty string for change-only entries)
 *   created_on  - ISO-8601
 *   private_notes - boolean
 */
export interface RawRedmineJournal {
  id: number
  user?: { id: number; name?: string }
  notes?: string
  created_on?: string
  private_notes?: boolean
  details?: Array<{ property: string; name: string; old_value?: string; new_value?: string }>
  [key: string]: unknown
}

export function transformJournal(
  raw: RawRedmineJournal,
  taskId?: string,
  projectId?: string,
): Comment {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    taskId,
    projectId,
    authorId: raw.user ? String(raw.user.id) : '',
    body: pickStr(raw.notes) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_on) ?? new Date(0).toISOString(),
    platform: 'redmine',
    metadata: strMap({
      authorName: raw.user?.name,
      privateNotes: raw.private_notes,
    }),
    raw,
  }
}
