import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ONES issue comment resource from GET /project/issues/:id/comments.
 *
 * Key fields (verified against ONES OpenAPI v2 docs):
 *   id          — comment identifier
 *   text        — comment body (plain or rich text)
 *   owner       — { id, name } author reference
 *   createTime  — Unix epoch seconds
 *   updateTime  — Unix epoch seconds (optional)
 *
 * Docs: https://docs.ones.com/developer/openapi/api/issue-comment
 */
export interface RawOnesComment {
  id?: string
  text?: string
  content?: string
  owner?: { id?: string; name?: string } | string | null
  createTime?: number | string
  updateTime?: number | string
  [key: string]: unknown
}

function ownerId(v: RawOnesComment['owner']): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.id ?? ''
}

export function transformComment(raw: RawOnesComment, taskId?: string): Comment {
  const id = raw.id ?? ''
  return {
    id,
    externalId: id,
    taskId,
    authorId: ownerId(raw.owner),
    body: pickStr(raw.text ?? raw.content) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createTime) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updateTime),
    platform: 'ones',
    metadata: strMap({}),
    raw,
  }
}
