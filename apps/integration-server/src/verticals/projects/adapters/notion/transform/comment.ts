import type { Comment } from '../../../schema'
import { strMap, toIso, richTextToPlain, type NotionRichText } from './shared'

/**
 * A Notion comment. The body lives in a `rich_text` array; the parent is a
 * page or block. Discussion threads are distinguished by `discussion_id`.
 */
export interface RawNotionComment {
  object?: string
  id: string
  parent?: { type?: string; page_id?: string; block_id?: string }
  discussion_id?: string
  rich_text?: NotionRichText[]
  created_by?: { id?: string }
  created_time?: string
  last_edited_time?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawNotionComment,
  taskId?: string,
  projectId?: string,
): Comment {
  // A comment's parent page is, in this vertical's mapping, a task (a data-source row).
  const parentPageId = raw.parent?.type === 'page_id' ? raw.parent.page_id : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? parentPageId,
    projectId,
    authorId: raw.created_by?.id ?? '',
    body: richTextToPlain(raw.rich_text) ?? '',
    mentions: (raw.rich_text ?? [])
      .filter((t) => t.type === 'mention')
      .map((t) => (t as { mention?: { user?: { id?: string } } }).mention?.user?.id)
      .filter((id): id is string => Boolean(id)),
    attachmentCount: 0,
    createdAt: toIso(raw.created_time) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.last_edited_time),
    platform: 'notion',
    metadata: strMap({
      discussionId: raw.discussion_id,
      parentType: raw.parent?.type,
      parentBlockId: raw.parent?.block_id,
    }),
    raw,
  }
}
