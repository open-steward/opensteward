/**
 * Transform a Nextcloud Deck OCS comment into the canonical Comment schema.
 *
 * Comments are fetched via the OCS API and wrapped in an ocs.data array.
 * Each comment object has:
 *   id, objectId (cardId), message, actorId, actorType,
 *   creationDateTime (ISO-8601), mentions, replyTo
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNextcloudDeckComment {
  id: number
  objectId?: number
  message?: string
  actorId?: string
  actorType?: string
  creationDateTime?: string
  mentions?: Array<{ mentionId?: string; mentionType?: string }>
  replyTo?: { id?: number } | null
  [key: string]: unknown
}

export function transformComment(raw: RawNextcloudDeckComment, taskId?: string): Comment {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: taskId ?? (raw.objectId != null ? String(raw.objectId) : undefined),
    projectId: undefined,
    authorId: pickStr(raw.actorId) ?? '',
    body: pickStr(raw.message) ?? '',
    mentions: (raw.mentions ?? [])
      .map((m) => m.mentionId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
    attachmentCount: 0,
    createdAt: toIso(raw.creationDateTime) ?? new Date(0).toISOString(),
    platform: 'nextcloud-deck',
    metadata: strMap({
      actorType: raw.actorType,
      replyToId: raw.replyTo?.id,
    }),
    raw,
  }
}
