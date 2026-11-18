/**
 * Plain timeline entry → canonical Message transform.
 *
 * Plain thread timeline entries contain the conversation history.
 * We surface CustomerChatItem and AgentChatItem entries as messages.
 * Docs: https://www.plain.com/docs/graphql/threads
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPlainTimelineEntry {
  id: string
  /** Discriminated union entry type, e.g. CustomerEmailItem, AgentChatItem, NoteItem */
  type?: string | null
  /** ISO-8601 timestamp */
  timestamp?: { iso8601?: string | null } | null
  /** CustomerEmailItem / CustomerChatItem */
  customerActor?: { customerId?: string | null } | null
  /** MachineUserActor / UserActor */
  machineUserActor?: { machineUserId?: string | null } | null
  userActor?: { userId?: string | null } | null
  /** Text content of the entry */
  text?: { value?: string | null } | null
  /** Email-specific content */
  textContent?: string | null
  [key: string]: unknown
}

function resolveAuthorId(raw: RawPlainTimelineEntry): string {
  return (
    pickStr(raw.customerActor?.customerId) ??
    pickStr(raw.userActor?.userId) ??
    pickStr(raw.machineUserActor?.machineUserId) ??
    ''
  )
}

function resolveAuthorType(raw: RawPlainTimelineEntry): AuthorType {
  if (raw.customerActor?.customerId) return 'contact'
  if (raw.userActor?.userId) return 'user'
  if (raw.machineUserActor?.machineUserId) return 'system'
  return 'user'
}

function resolveMessageType(raw: RawPlainTimelineEntry): MessageType {
  const t = (raw.type ?? '').toLowerCase()
  if (t.includes('note') || t.includes('internal')) return 'internal'
  return 'public'
}

function resolveBody(raw: RawPlainTimelineEntry): string {
  return (
    pickStr(raw.textContent) ??
    pickStr(raw.text?.value) ??
    ''
  )
}

export function transformMessage(raw: RawPlainTimelineEntry, ticketId: string): Message {
  return {
    id: raw.id,
    externalId: raw.id,
    ticketId,
    authorId: resolveAuthorId(raw),
    authorType: resolveAuthorType(raw),
    body: resolveBody(raw),
    type: resolveMessageType(raw),
    createdAt: toIso(raw.timestamp?.iso8601) ?? new Date(0).toISOString(),
    platform: 'plain',
    metadata: strMap({ entryType: raw.type }),
    raw,
  }
}
