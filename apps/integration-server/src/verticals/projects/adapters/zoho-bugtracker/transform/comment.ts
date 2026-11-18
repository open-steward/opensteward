/**
 * Transform a Zoho BugTracker bug comment into the canonical Comment shape.
 *
 * GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/bugs/[BUGID]/comments/
 * Docs: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoBugtrackerComment {
  id: string | number
  id_string?: string
  content?: string
  /** Display-formatted content (may contain HTML) */
  content_formatted?: string
  added_by?: string
  added_by_id?: string | number
  added_time?: string
  added_time_long?: number
  notify_all?: boolean
  [key: string]: unknown
}

export function transformComment(
  raw: RawZohoBugtrackerComment,
  bugId?: string,
  projectId?: string,
): Comment {
  const id = pickStr(raw.id_string) ?? String(raw.id)
  return {
    id,
    externalId: id,
    taskId: bugId,
    projectId,
    authorId: raw.added_by_id != null ? String(raw.added_by_id) : '',
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.added_time_long ?? raw.added_time) ?? new Date(0).toISOString(),
    platform: 'zoho-bugtracker',
    metadata: strMap({ addedBy: raw.added_by }),
    raw,
  }
}
