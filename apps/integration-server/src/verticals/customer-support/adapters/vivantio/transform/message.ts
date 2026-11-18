/**
 * Vivantio Action (ticket note/history entry) → canonical Message transform.
 *
 * Vivantio calls ticket comments "Actions". Each action has:
 *   - Id, ParentId (= ticketId), Notes (the body text), NotesHtml
 *   - IsPrivate / InternalComment flags
 *   - ActionType integer (0=Note, 1=Email, 2=Phone, 3=Status change, ...)
 *   - ActionUserName (the agent who performed the action)
 *   - ActionDate (timestamp)
 *   - IsCustomerAction (true when submitted by the end-user)
 *   - IsSystemAction (automated system actions)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawVivantioAction {
  Id: number
  ParentId?: number
  ActionUserName?: string | null
  ActionUserEmail?: string | null
  ActionDate?: string | null
  Notes?: string | null
  NotesHtml?: string | null
  IsPrivate?: boolean
  InternalComment?: string | null
  ActionType?: number
  IsCustomerAction?: boolean
  IsSystemAction?: boolean
  Effort?: number
  Description?: string | null
  CategoryId?: number | null
  CategoryLineage?: string | null
  [key: string]: unknown
}

function mapMessageType(raw: RawVivantioAction): MessageType {
  if (raw.IsPrivate === true) return 'internal'
  if (raw.InternalComment) return 'internal'
  return 'public'
}

function mapAuthorType(raw: RawVivantioAction): AuthorType {
  if (raw.IsCustomerAction === true) return 'contact'
  if (raw.IsSystemAction === true) return 'system'
  return 'user'
}

export function transformMessage(raw: RawVivantioAction, ticketId: string): Message {
  const body =
    pickStr(raw.Notes) ??
    pickStr(raw.InternalComment) ??
    pickStr(raw.Description) ??
    ''

  return {
    id: String(raw.Id),
    externalId: String(raw.Id),
    ticketId,
    authorId: pickStr(raw.ActionUserEmail) ?? pickStr(raw.ActionUserName) ?? '',
    authorType: mapAuthorType(raw),
    body,
    type: mapMessageType(raw),
    attachmentCount: undefined,
    createdAt: toIso(raw.ActionDate) ?? new Date(0).toISOString(),
    platform: 'vivantio',
    metadata: strMap({
      actionType: raw.ActionType,
      actionUserName: raw.ActionUserName,
      effort: raw.Effort,
      categoryLineage: raw.CategoryLineage,
    }),
    raw,
  }
}
