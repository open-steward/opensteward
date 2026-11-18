/**
 * Affinity v2 interactions → canonical Activity.
 *
 * v2 has no `/interactions`; it serves each kind from its own list:
 * GET /v2/emails, /v2/calls, /v2/meetings and /v2/chat-messages
 * (https://developer.affinity.co/api-reference/openapi.json, 2026-09-17).
 * Each kind has its own id space, so the canonical id carries the kind.
 *
 * Fixtures: the spec has no whole-record example for these schemas, so each
 * fixture is assembled from the property-level `example` values of
 * `interactions.Email`, `interactions.Call`, `interactions.Meeting` and
 * `interactions.ChatMessage`, with the participant fields built the same way
 * from `Attendee`, `AttendeesPreview`, `PersonData` and `PersonDataPreview`.
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  parseActivityId,
  type RawAffinityEmail,
  type RawAffinityCall,
  type RawAffinityMeeting,
  type RawAffinityChatMessage,
  type RawAffinityPersonData,
  type RawAffinityAttendee,
  type RawAffinityPreview,
} from '../../../../../../../src/verticals/crm/adapters/affinity/transform/activity'

/** `PersonData` property examples. */
const PERSON: RawAffinityPersonData = {
  id: 1,
  firstName: 'Jane',
  lastName: 'Doe',
  primaryEmailAddress: 'jane.smith@northpointvc.com',
  type: 'internal',
}
/** `Attendee` property examples. */
const ATTENDEE: RawAffinityAttendee = { emailAddress: 'john.smith@contoso.com', person: PERSON }
/** `AttendeesPreview` / `PersonDataPreview` (totalCount example 200). */
const ATTENDEES: RawAffinityPreview<RawAffinityAttendee> = { data: [ATTENDEE], totalCount: 200 }
const PERSONS: RawAffinityPreview<RawAffinityPersonData> = { data: [PERSON], totalCount: 200 }

const EMAIL: RawAffinityEmail = {
  id: 1,
  sentAt: '2023-01-01T00:00:00Z',
  loggingType: 'automated',
  direction: 'received',
  subject: 'Example subject',
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
  from: ATTENDEE,
  toParticipantsPreview: ATTENDEES,
  ccParticipantsPreview: ATTENDEES,
}

const CALL: RawAffinityCall = {
  id: 1,
  loggingType: 'manual',
  title: 'Example title',
  startTime: '2023-01-01T00:00:00Z',
  endTime: '2023-01-01T00:00:00Z',
  allDay: false,
  creator: ATTENDEE,
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
  attendeesPreview: ATTENDEES,
}

const MEETING: RawAffinityMeeting = {
  id: 1,
  loggingType: 'automated',
  title: 'Example title',
  startTime: '2023-01-01T00:00:00Z',
  endTime: '2023-01-01T00:00:00Z',
  allDay: false,
  creator: ATTENDEE,
  organizer: ATTENDEE,
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
  attendeesPreview: ATTENDEES,
}

const CHAT: RawAffinityChatMessage = {
  id: 1,
  sentAt: '2023-01-01T00:00:00Z',
  loggingType: 'manual',
  direction: 'sent',
  creator: PERSON,
  createdAt: '2022-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
  participantsPreview: PERSONS,
}

describe('affinity transformActivity', () => {
  it('email: maps the documented example and satisfies the canonical schema', () => {
    expect(ActivitySchema.parse(transformActivity({ kind: 'email', raw: EMAIL }))).toEqual({
      id: 'email:1',
      type: 'email',
      subject: 'Example subject',
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z',
      metadata: EMAIL,
    })
  })

  it('email: an obfuscated subject ("********") is not reported as the subject', () => {
    const out = ActivitySchema.parse(
      transformActivity({ kind: 'email', raw: { ...EMAIL, subject: '********' } }),
    )
    expect(out.subject).toBeUndefined()
  })

  it('email: a null subject and null updatedAt are omitted', () => {
    const out = ActivitySchema.parse(
      transformActivity({ kind: 'email', raw: { ...EMAIL, subject: null, updatedAt: null } }),
    )
    expect('subject' in out).toBe(false)
    expect('updated_at' in out).toBe(false)
  })

  it('call: maps title and startTime', () => {
    expect(ActivitySchema.parse(transformActivity({ kind: 'call', raw: CALL }))).toEqual({
      id: 'call:1',
      type: 'call',
      subject: 'Example title',
      due_date: '2023-01-01T00:00:00.000Z',
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z',
      metadata: CALL,
    })
  })

  it('meeting: maps title and startTime', () => {
    expect(ActivitySchema.parse(transformActivity({ kind: 'meeting', raw: MEETING }))).toEqual({
      id: 'meeting:1',
      type: 'meeting',
      subject: 'Example title',
      due_date: '2023-01-01T00:00:00.000Z',
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z',
      metadata: MEETING,
    })
  })

  it.each(['call', 'meeting'] as const)(
    '%s: due_date is startTime (the documented start), not endTime',
    (kind) => {
      const raw = {
        ...(kind === 'call' ? CALL : MEETING),
        startTime: '2023-01-01T00:00:00Z',
        endTime: '2023-01-01T01:30:00Z',
      }
      const out = ActivitySchema.parse(
        transformActivity({ kind, raw } as Parameters<typeof transformActivity>[0]),
      )
      expect(out.due_date).toBe('2023-01-01T00:00:00.000Z')
    },
  )

  it('chat message: maps the documented example', () => {
    expect(ActivitySchema.parse(transformActivity({ kind: 'chat-message', raw: CHAT }))).toEqual({
      id: 'chat-message:1',
      type: 'chat-message',
      created_at: '2022-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z',
      metadata: CHAT,
    })
  })

  it('the same numeric id in two kinds gives two distinct activity ids', () => {
    const a = transformActivity({ kind: 'email', raw: EMAIL }).id
    const b = transformActivity({ kind: 'call', raw: CALL }).id
    expect(a).not.toBe(b)
  })
})

describe('affinity parseActivityId', () => {
  it('reads back every id transformActivity mints', () => {
    for (const [kind, raw] of [
      ['email', EMAIL],
      ['call', CALL],
      ['meeting', MEETING],
      ['chat-message', CHAT],
    ] as const) {
      const id = transformActivity({ kind, raw } as Parameters<typeof transformActivity>[0]).id
      expect(parseActivityId(id)).toEqual({ kind, id: 1 })
    }
  })

  it.each(['1', 'interaction:1', 'email:', 'email:abc', 'email:0', 'email:1.5'])(
    'refuses %s with a 404',
    (id) => {
      expect(() => parseActivityId(id)).toThrow(expect.objectContaining({ statusCode: 404 }))
    },
  )
})
