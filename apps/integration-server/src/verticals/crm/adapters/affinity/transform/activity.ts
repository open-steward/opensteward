import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * Affinity v2 has no `/interactions`. Each kind is its own list, with its
 * own id space (https://developer.affinity.co/api-reference/openapi.json,
 * 2026-09-17):
 *
 *   GET /v2/emails         "Paginate through all emails in Affinity."
 *   GET /v2/calls          "Paginate through all calls in Affinity."
 *   GET /v2/meetings       "Paginate through all Meetings in Affinity."
 *   GET /v2/chat-messages  "Paginate through all chat messages in Affinity."
 *
 * A canonical activity id is therefore `<kind>:<id>`.
 */
export const INTERACTION_KINDS = ['email', 'call', 'meeting', 'chat-message'] as const
export type AffinityInteractionKind = (typeof INTERACTION_KINDS)[number]

export const INTERACTION_PATHS: Record<AffinityInteractionKind, string> = {
  email: '/v2/emails',
  call: '/v2/calls',
  meeting: '/v2/meetings',
  'chat-message': '/v2/chat-messages',
}

/** `PersonData` (every field required in the spec). */
export interface RawAffinityPersonData {
  id: number
  firstName: string | null
  lastName: string | null
  primaryEmailAddress: string | null
  type: 'internal' | 'collaborator' | 'external'
}

/** `Attendee` */
export interface RawAffinityAttendee {
  emailAddress: string | null
  person: RawAffinityPersonData | null
}

/** `AttendeesPreview` / `PersonDataPreview` */
export interface RawAffinityPreview<T> {
  data: T[]
  totalCount: number
}

/** `interactions.Email` */
export interface RawAffinityEmail {
  id: number
  sentAt: string
  loggingType: string
  direction: 'sent' | 'received'
  /** "If the authenticated user does not have permission to see the subject, it is obfuscated and returned as `********`" */
  subject: string | null
  createdAt: string
  updatedAt: string | null
  from: RawAffinityAttendee
  toParticipantsPreview: RawAffinityPreview<RawAffinityAttendee>
  ccParticipantsPreview: RawAffinityPreview<RawAffinityAttendee>
  [key: string]: unknown
}

/** `interactions.Call` */
export interface RawAffinityCall {
  id: number
  loggingType: string
  title: string | null
  /** "The timestamp of when the call starts" */
  startTime: string
  endTime: string | null
  allDay: boolean
  creator: RawAffinityAttendee | null
  createdAt: string
  updatedAt: string | null
  attendeesPreview: RawAffinityPreview<RawAffinityAttendee>
  [key: string]: unknown
}

/** `interactions.Meeting` */
export interface RawAffinityMeeting extends RawAffinityCall {
  organizer: RawAffinityAttendee | null
}

/** `interactions.ChatMessage` */
export interface RawAffinityChatMessage {
  id: number
  sentAt: string
  loggingType: string
  direction: 'sent' | 'received'
  creator: RawAffinityPersonData
  createdAt: string
  updatedAt: string | null
  participantsPreview: RawAffinityPreview<RawAffinityPersonData>
  [key: string]: unknown
}

export type AffinityInteraction =
  | { kind: 'email'; raw: RawAffinityEmail }
  | { kind: 'call'; raw: RawAffinityCall }
  | { kind: 'meeting'; raw: RawAffinityMeeting }
  | { kind: 'chat-message'; raw: RawAffinityChatMessage }

/** Documented placeholder for a subject the user may not see. */
const OBFUSCATED_SUBJECT = '********'

export function transformActivity(row: AffinityInteraction): Activity {
  const { kind, raw } = row
  const out: Activity = { id: `${kind}:${raw.id}`, type: kind, metadata: raw }
  if (kind === 'email') {
    if (raw.subject && raw.subject !== OBFUSCATED_SUBJECT) out.subject = raw.subject
  } else if (kind === 'call' || kind === 'meeting') {
    if (raw.title) out.subject = raw.title
    const due = toIsoDatetime(raw.startTime)
    if (due) out.due_date = due
  }
  const created = toIsoDatetime(raw.createdAt)
  if (created) out.created_at = created
  const updated = toIsoDatetime(raw.updatedAt)
  if (updated) out.updated_at = updated
  return out
}

/** Split a canonical activity id back into its kind and Affinity id, or 404. */
export function parseActivityId(id: string): { kind: AffinityInteractionKind; id: number } {
  const sep = id.indexOf(':')
  const kind = id.slice(0, sep) as AffinityInteractionKind
  const n = id.slice(sep + 1)
  if (sep < 0 || !INTERACTION_KINDS.includes(kind) || !/^[1-9]\d*$/.test(n)) {
    throw Object.assign(
      new Error(
        `Affinity activity ${JSON.stringify(id)} not found: activity ids are <kind>:<id>, kind one of ${INTERACTION_KINDS.join(', ')}`,
      ),
      { statusCode: 404 },
    )
  }
  return { kind, id: Number(n) }
}
