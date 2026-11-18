/**
 * Fibery comment transform.
 *
 * Comments in Fibery are entities in the built-in `comments/comment` database.
 * They are linked to a parent entity (task/entity) via a `comments/comments`
 * collection field on the parent. Each comment has:
 *
 *   fibery/id              — UUID
 *   fibery/public-id       — sequential public ID
 *   fibery/creation-date   — ISO creation timestamp
 *   fibery/created-by      — author user reference { fibery/id, user/name }
 *   comment/document-secret — collaborative document secret (body content)
 *   comments/parent        — parent entity reference { fibery/id }
 *
 * Note: the comment body is stored in a collaborative document and requires a
 * second call to `/api/documents/{secret}` to retrieve. The transform maps
 * `comment/document-secret` to `metadata.documentSecret` and leaves `body`
 * as an empty string. Callers that need full body text should fetch the
 * document separately using that secret.
 *
 * Docs: https://developers.fibery.com/guides/http-api/rich-text-and-comments
 */
import type { Comment } from '../../../schema'
import { pickStr, toIso, strMap } from './shared'

export interface RawFiberyComment {
  /** UUID of the comment entity. */
  'fibery/id': string
  /** Sequential public ID. */
  'fibery/public-id'?: string | number
  /** ISO creation timestamp. */
  'fibery/creation-date'?: string
  /** Author user reference. */
  'fibery/created-by'?: { 'fibery/id'?: string; 'user/name'?: string }
  /** Collaborative document secret for the comment body. */
  'comment/document-secret'?: string
  /** Parent entity reference. */
  'comments/parent'?: { 'fibery/id'?: string }
  [key: string]: unknown
}

export function transformComment(raw: RawFiberyComment, taskId?: string): Comment {
  const id = raw['fibery/id'] ?? ''
  const authorRef = raw['fibery/created-by']
  const authorId = pickStr(authorRef?.['fibery/id']) ?? ''
  const documentSecret = pickStr(raw['comment/document-secret'])
  const parentId = pickStr(raw['comments/parent']?.['fibery/id'])

  return {
    id,
    externalId: id,
    taskId: taskId ?? parentId,
    projectId: undefined,
    authorId,
    // Body text requires a second call to /api/documents/{secret}.
    // Surface as empty string; callers can enrich via documentSecret in metadata.
    body: '',
    mentions: [],
    attachmentCount: undefined,
    createdAt: toIso(raw['fibery/creation-date']) ?? new Date(0).toISOString(),
    updatedAt: undefined,
    platform: 'fibery',
    metadata: strMap({
      publicId: raw['fibery/public-id'] != null ? String(raw['fibery/public-id']) : undefined,
      authorName: authorRef?.['user/name'],
      documentSecret,
      parentId,
    }),
    raw,
  }
}
