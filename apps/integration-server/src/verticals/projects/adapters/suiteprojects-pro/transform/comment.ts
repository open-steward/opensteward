/**
 * Transform a raw SuiteProjects Pro threaded-message record into the canonical Comment schema.
 *
 * OpenAir threaded-message fields used here:
 *   id            – integer, unique message identifier
 *   content       – string, message body
 *   userId        – integer (read-only), author employee internal ID
 *   recordId      – integer, ID of the record this message is attached to
 *   tableName     – string, table name of the parent record (e.g. "project")
 *   replyToId     – number, original message ID if this is a reply (null/0 = root)
 *   created       – string($date-time), system-generated creation timestamp
 *   updated       – string($date-time), system-generated last-modified timestamp
 *
 * Note: SuiteProjects Pro threaded messages are scoped to a project (recordId + tableName).
 * There is no direct task-level discussion in the REST API; comments retrieved via
 * the threaded-messages endpoint are project-level discussion messages.
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSuiteProjectsMessage {
  id?: number | string
  content?: string
  userId?: number | string
  recordId?: number | string
  tableName?: string
  replyToId?: number | null
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawSuiteProjectsMessage,
  projectId?: string,
): Comment {
  const id = String(raw.id ?? '')
  // recordId is the project ID when tableName === 'project'
  const resolvedProjectId =
    projectId ??
    (raw.tableName === 'project' && raw.recordId != null
      ? String(raw.recordId)
      : undefined)
  return {
    id,
    externalId: id,
    taskId: undefined,
    projectId: resolvedProjectId,
    authorId: raw.userId != null ? String(raw.userId) : '',
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    platform: 'suiteprojects-pro',
    metadata: strMap({
      tableName: raw.tableName,
      replyToId: raw.replyToId != null ? String(raw.replyToId) : undefined,
    }),
    raw,
  }
}
