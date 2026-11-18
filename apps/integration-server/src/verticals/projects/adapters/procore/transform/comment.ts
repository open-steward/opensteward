/**
 * Procore RFI Reply → canonical Comment.
 *
 * Procore documents the replies on an RFI at
 *   GET /rest/v1.0/projects/{project_id}/rfis/{rfi_id}/replies       (List RFI Replies)
 *   GET /rest/v1.0/projects/{project_id}/rfis/{rfi_id}/replies/{id}  (Show RFI Reply)
 * (https://developers.procore.com/api/v1/resource_groups/resource/replies?version=rest_v1.0).
 *
 * Only these documented reply fields are read: `id`, `official`, `answer_date`
 * ("Timestamp when this reply was created"), `plain_text_body`, `created_by`
 * (the author's display name), `created_by_id` and `attachments` (counted
 * only). `rich_text_body` is deliberately not read. A reply carries no project or RFI id and no update
 * timestamp, so the project and RFI come from the request that listed it.
 *
 * The canonical id is `projectId:rfiId:replyId` because Show RFI Reply needs
 * all three; `externalId` is Procore's own reply id.
 */
import type { Comment } from '../../../schema'
import { strMap, toIso } from './shared'

export interface RawProcoreRfiReply {
  id: number | string
  official?: boolean | null
  answer_date?: string | null
  plain_text_body?: string | null
  rich_text_body?: string | null
  created_by?: string | null
  created_by_id?: number | string | null
  attachments?: Array<{ id?: number | string; name?: string; url?: string }> | null
  [key: string]: unknown
}

/** The canonical id `getComment` reads back: `projectId:rfiId:replyId`. */
export function procoreCommentId(projectId: string, rfiId: string, replyId: string): string {
  return `${projectId}:${rfiId}:${replyId}`
}

export function transformComment(
  raw: RawProcoreRfiReply,
  rfiId: string,
  projectId: string,
): Comment {
  const replyId = String(raw.id)
  if (raw.created_by_id == null) {
    throw new Error(`Procore RFI reply ${replyId} has no created_by_id`)
  }
  if (typeof raw.plain_text_body !== 'string') {
    throw new Error(`Procore RFI reply ${replyId} has no plain_text_body`)
  }
  const createdAt = toIso(raw.answer_date)
  if (createdAt === undefined) {
    throw new Error(`Procore RFI reply ${replyId} has no answer_date`)
  }

  return {
    id: procoreCommentId(projectId, rfiId, replyId),
    externalId: replyId,
    taskId: rfiId,
    projectId,
    authorId: String(raw.created_by_id),
    body: raw.plain_text_body,
    mentions: [],
    ...(Array.isArray(raw.attachments) ? { attachmentCount: raw.attachments.length } : {}),
    createdAt,
    platform: 'procore',
    metadata: strMap({
      authorName: raw.created_by,
      official: raw.official,
      rfiId,
    }),
    raw,
  }
}
