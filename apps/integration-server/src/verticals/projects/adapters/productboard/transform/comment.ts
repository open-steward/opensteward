import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Productboard v1 note → canonical Comment.
 *
 * Notes are customer-feedback bodies optionally linked to features.
 * The note body is in `content`; a short `title` may also be present.
 * The `owner` object (not `createdBy`) carries the author email.
 *
 * v1 endpoint shape:
 *   GET /notes → {
 *     data: [{
 *       id, title, content, state, displayUrl,
 *       owner: { name, email },
 *       createdBy: { id, name, email },
 *       company: { id },
 *       tags, createdAt, updatedAt, source: { origin, record_id }
 *     }]
 *   }
 *   Filter by feature: GET /notes?featureId=<id>
 */
export interface RawProductboardNote {
  id: string
  title?: string
  content?: string
  state?: string
  displayUrl?: string
  owner?: { name?: string; email?: string } | null
  createdBy?: { id?: string; name?: string; email?: string } | null
  company?: { id?: string } | null
  tags?: string[]
  source?: { origin?: string; record_id?: string } | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformComment(raw: RawProductboardNote, taskId?: string): Comment {
  const authorId =
    pickStr(raw.createdBy?.id ?? raw.createdBy?.email ?? raw.owner?.email) ?? ''

  return {
    id: raw.id,
    externalId: raw.id,
    taskId: pickStr(taskId),
    authorId,
    body: pickStr(raw.content ?? raw.title) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    platform: 'productboard',
    metadata: strMap({
      title: raw.title,
      state: raw.state,
      sourceOrigin: raw.source?.origin,
      tagCount: raw.tags?.length,
      ownerEmail: raw.owner?.email,
    }),
    raw,
  }
}
