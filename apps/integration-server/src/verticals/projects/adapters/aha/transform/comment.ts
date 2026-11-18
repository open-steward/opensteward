/**
 * Aha! Comment → canonical Comment.
 *
 * Comments are fetched per feature (`/features/:id/comments`), so the owning
 * task id is passed in by the caller. Aha! exposes the author under `user`.
 *
 * Never throws — missing optionals resolve to `undefined`.
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawAhaComment {
  id: string
  body?: string
  created_at?: string
  updated_at?: string
  user?: { id: string; name?: string; email?: string } | null
  attachments?: unknown[]
  [key: string]: unknown
}

export function transformComment(raw: RawAhaComment, taskId?: string): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId,
    authorId: raw.user?.id ?? '',
    body: pickStr(raw.body) ?? '',
    mentions: [],
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    platform: 'aha',
    metadata: strMap({}),
    raw,
  }
}
