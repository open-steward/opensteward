/**
 * LiveAgent MessageGroup + Message → canonical Message.
 *
 * LiveAgent v3 returns ticket messages as MessageGroups, each of which
 * contains a `messages` array of individual Message objects.
 *
 * Message.type values: MESSAGE, INTERNAL, FILE, NOTE, SYSTEM (and legacy variants).
 * Message.visibility values: D (deleted), V (visible), etc.
 * Message.format values: TEXT, HTML, JSON (and legacy variants).
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Individual message inside a MessageGroup */
export interface RawLiveagentMessage {
  id?: string
  userid?: string
  type?: string
  datecreated?: string
  format?: string
  message?: string
  visibility?: string
  [key: string]: unknown
}

/** MessageGroup as returned by GET /tickets/{ticketId}/messages */
export interface RawLiveagentMessageGroup {
  id?: string
  userid?: string
  user_full_name?: string
  type?: string
  status?: string
  datecreated?: string
  messages?: RawLiveagentMessage[]
  [key: string]: unknown
}

function mapMessageType(t: string | undefined): MessageType {
  if (t === 'INTERNAL' || t === 'NOTE') return 'internal'
  return 'public'
}

function mapAuthorType(_t: string | undefined): AuthorType {
  // LiveAgent does not expose a reliable end-user vs agent flag in message type;
  // default to 'user' (agent) as messages endpoint is agent-facing.
  return 'user'
}

/**
 * Flatten a MessageGroup into canonical Messages.
 * One MessageGroup may contain multiple Message objects; each becomes a
 * separate canonical Message. Falls back to treating the group itself as
 * a single message when the inner `messages` array is absent.
 */
export function transformMessageGroup(
  group: RawLiveagentMessageGroup,
  ticketId: string,
): Message[] {
  const msgs = group.messages
  if (msgs && msgs.length > 0) {
    return msgs.map((m) => transformMessage(m, group, ticketId))
  }
  // Group has no nested messages — treat the group as the message body
  const fallback: RawLiveagentMessage = {
    id: group.id,
    userid: group.userid,
    type: group.type,
    datecreated: group.datecreated,
    message: '',
  }
  return [transformMessage(fallback, group, ticketId)]
}

function transformMessage(
  raw: RawLiveagentMessage,
  group: RawLiveagentMessageGroup,
  ticketId: string,
): Message {
  const id = pickStr(raw.id) ?? pickStr(group.id) ?? ''
  const type = mapMessageType(raw.type ?? group.type)
  const authorType = mapAuthorType(raw.type ?? group.type)
  return {
    id,
    externalId: id,
    ticketId,
    authorId: pickStr(raw.userid) ?? pickStr(group.userid) ?? '',
    authorType,
    body: pickStr(raw.message) ?? '',
    type,
    attachmentCount: undefined,
    createdAt: toIso(raw.datecreated) ?? toIso(group.datecreated) ?? new Date(0).toISOString(),
    platform: 'liveagent',
    metadata: strMap({
      groupId: group.id,
      rawType: raw.type ?? group.type,
      format: raw.format,
    }),
    raw,
  }
}
