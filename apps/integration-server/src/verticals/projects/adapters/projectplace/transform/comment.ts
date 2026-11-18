import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Projectplace conversation comment. Returned by
 * `GET /3/conversations/comments?item_id=&item_name=card` and
 * `GET /3/conversations/comment/{id}`. Anchored to an artifact via
 * `item_id` + `item_name` ('card', 'planlet', …). `create_time` is Unix
 * epoch seconds.
 */
export interface RawProjectplaceComment {
  id: number | string
  text?: string
  encoded_text?: string
  creator?: { id: number | string; name?: string } | null
  creator_id?: number | string | null
  create_time?: number | string
  modify_time?: number | string
  item_id?: number | string
  item_name?: string
  attachments?: unknown[]
  [key: string]: unknown
}

/** Epoch-seconds → ISO. */
function epochToIso(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return toIso(new Date(v * 1000).toISOString())
  if (typeof v === 'string' && /^\d+$/.test(v)) return toIso(new Date(Number(v) * 1000).toISOString())
  return toIso(v)
}

export function transformComment(raw: RawProjectplaceComment, taskId?: string): Comment {
  const itemIsCard = raw.item_name === 'card'
  const resolvedTaskId = taskId ?? (itemIsCard ? pickStr(raw.item_id) : undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: resolvedTaskId,
    projectId: undefined,
    authorId: pickStr(raw.creator?.id ?? raw.creator_id) ?? '',
    body: pickStr(raw.text ?? raw.encoded_text) ?? '',
    mentions: [],
    attachmentCount: raw.attachments?.length ?? 0,
    createdAt: epochToIso(raw.create_time) ?? new Date(0).toISOString(),
    updatedAt: epochToIso(raw.modify_time),
    platform: 'projectplace',
    metadata: strMap({ itemName: raw.item_name }),
    raw,
  }
}
