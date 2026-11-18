/**
 * Transform a Process Street Workflow Run into the canonical Comment shape.
 *
 * Process Street does not expose a public comments/activity-feed endpoint.
 * Workflow Runs contain metadata and status but no free-text comment threads
 * via the v1 REST API. This transform is a placeholder that maps any future
 * comment-like payload to the canonical Comment schema.
 *
 * If the API adds a comments resource it can be mapped here:
 *   id, workflowRunId, body, authorId, createdAt
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawProcessStreetComment {
  id: string
  /** ID of the Workflow Run the comment belongs to */
  workflowRunId?: string
  /** ID of the Task the comment belongs to */
  taskId?: string
  body?: string
  authorId?: string
  /** ISO-8601 */
  createdAt?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawProcessStreetComment,
  taskId?: string,
  workflowRunId?: string,
): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? raw.taskId,
    projectId: workflowRunId ?? raw.workflowRunId,
    authorId: pickStr(raw.authorId) ?? '',
    body: pickStr(raw.body) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'process-street',
    metadata: strMap({ workflowRunId: workflowRunId ?? raw.workflowRunId }),
    raw,
  }
}
