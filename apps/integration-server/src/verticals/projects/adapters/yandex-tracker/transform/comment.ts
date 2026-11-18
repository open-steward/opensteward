import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Yandex Tracker comment object from GET /v3/issues/{issueId}/comments.
 * Docs: https://yandex.ru/support/tracker/en/api-ref/issues/get-comments
 */
export interface RawYandexTrackerComment {
  id: number | string
  longId?: string
  text?: string
  textHtml?: string
  createdBy?: { id: string; display?: string }
  updatedBy?: { id: string; display?: string }
  createdAt?: string
  updatedAt?: string
  version?: number
  type?: string
  transport?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawYandexTrackerComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const id = pickStr(raw.longId) ?? String(raw.id)
  return {
    id,
    externalId: id,
    taskId,
    projectId,
    authorId: raw.createdBy ? String(raw.createdBy.id) : '',
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    platform: 'yandex-tracker',
    metadata: strMap({ type: raw.type, transport: raw.transport }),
    raw,
  }
}
