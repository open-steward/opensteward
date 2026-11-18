import type { Comment } from '../../../schema'
import { pickStr, refId, refName, strMap, toIso, type CzReference } from './shared'

/**
 * A canonical Comment maps to an AdaptiveWork **Discussion** entity — a post on
 * a work item's discussion feed. `id` is the `/Discussion/<uuid>` URI,
 * `CreatedBy` the author reference, `Container` the work item the discussion
 * hangs off (its id is used as the canonical `taskId`).
 */
export interface RawClarizenDiscussion {
  id: string
  Text?: string
  CreatedBy?: CzReference
  Container?: CzReference
  CreatedOn?: string
  LastUpdatedOn?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawClarizenDiscussion,
  taskId?: string,
): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? refId(raw.Container),
    authorId: refId(raw.CreatedBy) ?? '',
    body: pickStr(raw.Text) ?? '',
    mentions: [],
    createdAt: toIso(raw.CreatedOn) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.LastUpdatedOn),
    platform: 'planview-adaptivework',
    metadata: strMap({
      authorName: refName(raw.CreatedBy),
      containerName: refName(raw.Container),
    }),
    raw,
  }
}
