import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ProductPlan comment object (from /api/v2/roadmaps/{id}/comments
 * and /api/v2/bars/{id}/comments).
 */
export interface RawProductplanComment {
  id?: number | string
  body?: string
  text?: string
  author?: { id?: number | string; name?: string; email?: string } | null
  user?: { id?: number | string; name?: string; email?: string } | null
  created_at?: string
  updated_at?: string
  bar_id?: number | string | null
  roadmap_id?: number | string | null
  [key: string]: unknown
}

export function transformComment(
  raw: RawProductplanComment,
  barId?: string,
  roadmapId?: string,
): Comment {
  const id = String(raw.id ?? '')
  const body = pickStr(raw.body) ?? pickStr(raw.text) ?? ''
  const author = raw.author ?? raw.user
  const authorId = author?.id != null ? String(author.id) : ''

  const resolvedBarId =
    barId ?? (raw.bar_id != null ? String(raw.bar_id) : undefined)
  const resolvedRoadmapId =
    roadmapId ?? (raw.roadmap_id != null ? String(raw.roadmap_id) : undefined)

  return {
    id,
    externalId: id,
    taskId: resolvedBarId,
    projectId: resolvedRoadmapId,
    authorId,
    body,
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'productplan',
    metadata: strMap({}),
    raw,
  }
}
