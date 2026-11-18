/**
 * TeamSupport ticket action (message) transform.
 *
 * TeamSupport stores replies/notes as "actions" on a ticket.
 * Key fields from /api/json/tickets/{id}/actions.json:
 *   ID, TicketID, Name (title/subject of action), Description (body),
 *   ActionType ("Public Comment", "Private Comment", "Note", etc.),
 *   CreatorID, UserID, DateCreated.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTeamsupportAction {
  ID?: number | string
  TicketID?: number | string
  Name?: string
  Description?: string
  ActionType?: string
  CreatorID?: number | string | null
  UserID?: number | string | null
  IsPublic?: boolean | string
  DateCreated?: string | null
  DateModified?: string | null
  [key: string]: unknown
}

function mapActionType(raw: RawTeamsupportAction): MessageType {
  const t = typeof raw.ActionType === 'string' ? raw.ActionType.toLowerCase() : ''
  if (t.includes('private') || t.includes('internal') || t === 'note') return 'internal'
  // IsPublic=false also marks internal
  if (raw.IsPublic === false || raw.IsPublic === 'false' || raw.IsPublic === 'False') return 'internal'
  return 'public'
}

function mapAuthorType(raw: RawTeamsupportAction): AuthorType {
  // TeamSupport actions with a UserID are from agents; CreatorID may be a contact
  if (raw.UserID != null) return 'user'
  if (raw.CreatorID != null) return 'contact'
  return 'system'
}

export function transformMessage(raw: RawTeamsupportAction, ticketId: string): Message {
  const type: MessageType = mapActionType(raw)
  const authorType: AuthorType = mapAuthorType(raw)
  const authorId = raw.UserID != null
    ? String(raw.UserID)
    : raw.CreatorID != null
      ? String(raw.CreatorID)
      : ''

  return {
    id: String(raw.ID ?? ''),
    externalId: String(raw.ID ?? ''),
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.Description) ?? pickStr(raw.Name) ?? '',
    type,
    createdAt: toIso(raw.DateCreated) ?? new Date(0).toISOString(),
    platform: 'teamsupport',
    metadata: strMap({ ActionType: raw.ActionType }),
    raw,
  }
}
