/**
 * Missive conversation → Ticket
 *
 * Fields from "Conversation properties" at
 * https://missiveapp.com/docs/developers/rest-api/endpoints ("The same shape is
 * returned by List conversations , Get a conversation , Update conversations ,
 * and Merge conversations"). Starred names are "always present":
 *
 *   id *               "Conversation UUID"
 *   created_at *       "Unix timestamp when the conversation was created"
 *   subject            "Conversation subject"
 *   latest_message_subject "Subject of the latest message in the conversation"
 *   organization       "Organization object ( id , name )"
 *   color              "HEX color or color name ( good , warning , danger )"
 *   external_authors * "Subset of authors excluding coworkers" — authors are
 *                      "Array of message authors ( name , address )"
 *   assignees *        "Subset of users who are assigned to the conversation"
 *   shared_labels *    "Array of shared label objects on the conversation"
 *   team               "Compact team object" (id *, name *, ...)
 *   messages_count *   "Number of messages in the conversation"
 *   last_activity_at * "Unix timestamp of the conversation's most recent activity"
 *   closed_at          "Unix timestamp when the task/tasked conversation was closed"
 *   web_url *, app_url *
 *
 * "When the API token user is a guest in the conversation, only id and
 * last_activity_at are returned." Such a row has no `created_at`, which the
 * canonical Ticket requires, so it cannot be transformed: see
 * `isGuestConversation`. The docs contradict themselves here: the "Get a
 * conversation" example response has no created_at (nor external_authors,
 * which the List example also omits although both are starred). The table is
 * followed; a row without created_at throws rather than inventing a date.
 *
 * Missive documents no conversation-level status or channel. Open/closed is a
 * per-user mailbox state (`users[].closed`: "Whether the conversation is in the
 * user's Closed mailbox"), so status is 'closed' only when `closed_at` is set
 * and 'unknown' otherwise; channel is 'unknown'.
 */
import type { Ticket } from '../../../schema'
import { strMap } from './shared'

export interface RawMissiveAuthor {
  name?: string | null
  address?: string | null
}

export interface RawMissiveConversationUser {
  id: string
  name?: string
  email?: string
}

export interface RawMissiveTeamRef {
  id: string
  name?: string
}

export interface RawMissiveLabelRef {
  id: string
  name?: string
}

export interface RawMissiveConversation {
  id: string
  created_at?: number
  subject?: string | null
  latest_message_subject?: string | null
  organization?: { id: string; name?: string } | null
  color?: string | null
  authors?: RawMissiveAuthor[]
  external_authors?: RawMissiveAuthor[]
  users?: RawMissiveConversationUser[]
  assignees?: RawMissiveConversationUser[]
  shared_labels?: RawMissiveLabelRef[]
  team?: RawMissiveTeamRef | null
  messages_count?: number
  last_activity_at: number
  closed_at?: number | null
  web_url?: string
  app_url?: string
}

/** A row returned with "only id and last_activity_at" (token user is a guest). */
export function isGuestConversation(raw: RawMissiveConversation): boolean {
  return typeof raw.created_at !== 'number'
}

function unixToIso(v: number | null | undefined): string | undefined {
  return typeof v === 'number' ? new Date(v * 1000).toISOString() : undefined
}

export function transformTicket(raw: RawMissiveConversation): Ticket {
  const createdAt = unixToIso(raw.created_at)
  if (createdAt === undefined) {
    // The properties table marks created_at "always present", except that "When
    // the API token user is a guest in the conversation, only id and
    // last_activity_at are returned". The Get a conversation example response
    // nevertheless omits it, so do not claim the cause: name the missing field.
    throw new Error(
      `Missive conversation ${raw.id} has no created_at, which a Ticket requires ` +
        '(Missive documents it as always present, except for a guest of the conversation)',
    )
  }
  const closedAt = unixToIso(raw.closed_at)
  return {
    id: raw.id,
    externalId: raw.id,
    subject: raw.subject ?? raw.latest_message_subject ?? '',
    status: closedAt ? 'closed' : 'unknown',
    channel: 'unknown',
    requesterId: raw.external_authors?.[0]?.address ?? '',
    assigneeId: raw.assignees?.[0]?.id,
    teamId: raw.team?.id,
    tagIds: (raw.shared_labels ?? []).map((l) => l.id),
    createdAt,
    updatedAt: unixToIso(raw.last_activity_at),
    closedAt,
    platform: 'missive',
    metadata: strMap({
      color: raw.color,
      messagesCount: raw.messages_count,
      organizationId: raw.organization?.id,
      webUrl: raw.web_url,
      appUrl: raw.app_url,
    }),
    raw,
  }
}
