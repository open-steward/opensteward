import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso, linkId, type HalLink } from './shared'

interface Formattable {
  format?: string
  raw?: string | null
  html?: string | null
}

/**
 * HAL+JSON Activity resource. `_type` is `Activity` (a change-tracking entry)
 * or `Activity::Comment` (user-authored). Only the latter carries a
 * meaningful `comment.raw`; the adapter filters to comments before mapping.
 * The author is `_links.user`; the parent task is `_links.workPackage`.
 */
export interface RawOpenProjectActivity {
  _type?: string
  id?: number | string
  comment?: Formattable | null
  createdAt?: string
  updatedAt?: string
  _links?: {
    self?: HalLink
    user?: HalLink
    workPackage?: HalLink
  }
  [key: string]: unknown
}

/** True when the activity is a user comment with body text. */
export function isComment(raw: RawOpenProjectActivity): boolean {
  if (raw._type === 'Activity::Comment') return true
  const body = raw.comment?.raw
  return typeof body === 'string' && body.trim().length > 0
}

export function transformComment(
  raw: RawOpenProjectActivity,
  taskId?: string,
): Comment {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    taskId: taskId ?? linkId(raw._links?.workPackage),
    projectId: undefined,
    authorId: linkId(raw._links?.user) ?? '',
    body: pickStr(raw.comment?.raw) ?? '',
    mentions: [],
    attachmentCount: undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    platform: 'openproject',
    metadata: strMap({ activityType: raw._type }),
    raw,
  }
}
