import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Meisterplan project comment → canonical Comment.
 *
 * Meisterplan exposes project-level comments under each project in a scenario.
 * These are the comments users add directly to a project in the UI (not
 * allocation comments, which live under a different sub-resource).
 *
 * Key API fields (GET /scenarios/{scenarioId}/projects/{projectId}/comments):
 *   id, content (body text), author { id, name },
 *   createdAt (ISO datetime), updatedAt (ISO datetime)
 *
 * Docs: https://api.us.meisterplan.com/docs/api.html#tag/Project-Comments
 */
export interface RawMeisterplanComment {
  id: string
  /** Body text of the comment. */
  content?: string | null
  author?: { id?: string; name?: string } | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformComment(
  raw: RawMeisterplanComment,
  projectId: string,
  scenarioId?: string,
): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    projectId,
    taskId: undefined,
    authorId: pickStr(raw.author?.id) ?? '',
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    platform: 'meisterplan',
    metadata: strMap({
      scenarioId,
      authorName: raw.author?.name,
    }),
    raw,
  }
}
