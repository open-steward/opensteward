import { toIsoDatetime } from '@opensteward/shared'
import type { Comment } from '../../../schema'
import { strMap } from './shared'

/**
 * Raw TAPD Comment, as documented for GET https://api.tapd.cn/comments
 * (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/comment/get_comments.html):
 *   "id 评论ID · title 标题 · description 内容 · author 评论人 · entry_type 评论类型
 *    （取值： bug、 bug_remark …、 stories、 tasks …） · entry_id 评论所依附的业务对象实体id ·
 *    created 创建时间 · modified 最后更改时间 · workspace_id 项目ID · root_id 根评论ID ·
 *    reply_id 评论回复的ID"
 */
export interface RawTapdComment {
  id: string
  title?: string
  description?: string
  author?: string
  entry_type?: string
  entry_id?: string
  workspace_id?: string
  root_id?: string
  reply_id?: string
  created?: string
  modified?: string
  [key: string]: unknown
}

function required(raw: RawTapdComment, field: 'author' | 'description'): string {
  const v = raw[field]
  if (typeof v !== 'string') {
    throw new Error(`TAPD comment ${raw.id} has no documented '${field}' field`)
  }
  return v
}

/**
 * `workspaceId` is the workspace_id the comment was requested under (the
 * endpoint requires it). The canonical id is `{workspace_id}:{id}` so
 * getComment can send it back; externalId is TAPD's own comment id.
 *
 * TAPD timestamps ("2020-06-09 10:51:06") carry no offset and the docs name
 * no zone; the shared helper reads them as UTC so every host agrees.
 */
export function transformComment(raw: RawTapdComment, workspaceId: string): Comment {
  const createdAt = toIsoDatetime(raw.created)
  if (!createdAt) throw new Error(`TAPD comment ${raw.id} has no documented 'created' time`)
  return {
    id: `${workspaceId}:${raw.id}`,
    externalId: raw.id,
    // A canonical Task is a TAPD story, so only a story comment has a taskId.
    taskId: raw.entry_type === 'stories' ? raw.entry_id : undefined,
    projectId: workspaceId,
    authorId: required(raw, 'author'),
    body: required(raw, 'description'),
    mentions: [],
    createdAt,
    updatedAt: toIsoDatetime(raw.modified),
    platform: 'tapd',
    metadata: strMap({
      entryType: raw.entry_type,
      title: raw.title,
      rootId: raw.root_id,
      replyId: raw.reply_id,
    }),
    raw,
  }
}
