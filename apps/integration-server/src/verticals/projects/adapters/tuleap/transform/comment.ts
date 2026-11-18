import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Tuleap changeset object returned by GET /api/artifacts/{id}/changesets.
 *
 * A changeset records a single modification to an artifact. When the
 * `post_processed_body` (or `body`) field of the `last_comment` sub-object is
 * non-empty, the changeset contains a user comment.
 *
 * Relevant fields:
 *   id           - numeric changeset identifier
 *   submitted_by - { id, uri, display_name, username, email, is_anonymous }
 *   submitted_on - ISO-8601 timestamp
 *   last_comment - { format, body, post_processed_body }
 *   changes      - array of field-change descriptors (not surfaced here)
 */
export interface RawTuleapChangesetSubmittedBy {
  id?: number
  display_name?: string
  username?: string
  email?: string
  uri?: string
  is_anonymous?: boolean
}

export interface RawTuleapChangeset {
  id: number
  submitted_by?: RawTuleapChangesetSubmittedBy
  submitted_on?: string
  last_comment?: {
    format?: string
    body?: string
    post_processed_body?: string
  }
  [key: string]: unknown
}

export function transformChangeset(
  raw: RawTuleapChangeset,
  taskId?: string,
  projectId?: string,
): Comment {
  const id = String(raw.id ?? '')
  const body =
    pickStr(raw.last_comment?.post_processed_body) ??
    pickStr(raw.last_comment?.body) ??
    ''
  const authorId =
    raw.submitted_by?.id != null ? String(raw.submitted_by.id) : ''

  return {
    id,
    externalId: id,
    taskId,
    projectId,
    authorId,
    body,
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.submitted_on) ?? new Date(0).toISOString(),
    platform: 'tuleap',
    metadata: strMap({
      authorName: raw.submitted_by?.display_name,
      authorUsername: raw.submitted_by?.username,
      format: raw.last_comment?.format,
    }),
    raw,
  }
}
