import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  transformActivityV2,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/activity'
import type {
  RawPipedriveActivity,
  RawPipedriveV2Activity,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/activity'

function makeRaw(overrides: Partial<RawPipedriveActivity> = {}): RawPipedriveActivity {
  return { id: 1, ...overrides }
}

describe('pipedrive transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })
  it('maps type and subject', () => {
    const result = transformActivity(makeRaw({ type: 'call', subject: 'Follow up' }))
    expect(result.type).toBe('call')
    expect(result.subject).toBe('Follow up')
  })
  it('maps done from boolean', () => {
    expect(transformActivity(makeRaw({ done: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ done: 1 })).done).toBe(true)
    expect(transformActivity(makeRaw({ done: false })).done).toBe(false)
  })
  it('maps contact_id from person_id', () => {
    expect(transformActivity(makeRaw({ person_id: 42 })).contact_id).toBe('42')
  })
  it('handles null person_id', () => {
    expect(transformActivity(makeRaw({ person_id: null })).contact_id).toBeUndefined()
  })
  it('constructs due_date with time', () => {
    const result = transformActivity(makeRaw({ due_date: '2024-01-15', due_time: '14:30' }))
    expect(result.due_date).toBe('2024-01-15T14:30:00')
  })
  it('parses duration_minutes', () => {
    expect(transformActivity(makeRaw({ duration: '1:30' })).duration_minutes).toBe(90)
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Call', type: 'call', done: true })
    expect(result.subject).toBe('Call')
    expect(result.type).toBe('call')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

/**
 * The documented example item of GET /api/v2/activities (getActivities,
 * https://developers.pipedrive.com/docs/api/v2/openapi.yaml), verbatim.
 */
const v2Example: RawPipedriveV2Activity = {
  id: 1,
  subject: 'Activity Subject',
  type: 'activity_type',
  owner_id: 1,
  creator_user_id: 1,
  is_deleted: false,
  add_time: '2021-01-01T00:00:00Z',
  update_time: '2021-01-01T00:00:00Z',
  deal_id: 5,
  lead_id: 'abc-def',
  person_id: 6,
  org_id: 7,
  project_id: 8,
  due_date: '2021-01-01',
  due_time: '15:00:00',
  duration: '01:00:00',
  busy: true,
  done: true,
  marked_as_done_time: '2021-01-01T00:00:00Z',
  location: {
    value: '123 Main St',
    country: 'USA',
    admin_area_level_1: 'CA',
    admin_area_level_2: 'Santa Clara',
    locality: 'Sunnyvale',
    sublocality: 'Downtown',
    route: 'Main St',
    street_number: '123',
    subpremise: 'Apt 1',
    postal_code: '94085',
  },
  participants: [{ person_id: 1, primary: true }],
  attendees: [
    {
      email: 'some@email.com',
      name: 'Some Name',
      status: 'accepted',
      is_organizer: true,
      person_id: 1,
      user_id: 1,
    },
  ],
  conference_meeting_client: 'google_meet',
  conference_meeting_url: 'https://meet.google.com/abc-xyz',
  conference_meeting_id: 'abc-xyz',
  public_description: 'Public Description',
  priority: 263,
  outcome: 101,
  note: 'Note',
}

describe('pipedrive transformActivityV2 (GET /api/v2/activities)', () => {
  it('maps the documented example and satisfies ActivitySchema', () => {
    const out = ActivitySchema.parse(transformActivityV2(v2Example))
    expect(out).toMatchObject({
      id: '1',
      type: 'activity_type',
      subject: 'Activity Subject',
      note: 'Note',
      contact_id: '6',
      company_id: '7',
      deal_id: '5',
      owner_id: '1',
      due_date: '2021-01-01T15:00:00.000Z',
      done: true,
      duration_minutes: 60,
      created_at: '2021-01-01T00:00:00.000Z',
      updated_at: '2021-01-01T00:00:00.000Z',
    })
    expect(out.metadata).toEqual(v2Example)
  })

  it('reads the migration guide example formats: due_time "00:00", duration "01:20"', () => {
    const out = ActivitySchema.parse(
      transformActivityV2({
        id: 123,
        due_date: '1970-01-01',
        due_time: '00:00',
        duration: '01:20',
        done: false,
      }),
    )
    expect(out.due_date).toBe('1970-01-01T00:00:00.000Z')
    expect(out.duration_minutes).toBe(80)
    expect(out.done).toBe(false)
  })

  it('reads owner_id (v1 user_id) as the owner', () => {
    expect(transformActivityV2({ id: 2, owner_id: 44 }).owner_id).toBe('44')
  })

  it('is the day at UTC midnight when due_time is null', () => {
    expect(transformActivityV2({ id: 3, due_date: '2024-05-06', due_time: null }).due_date).toBe(
      '2024-05-06T00:00:00.000Z',
    )
  })

  it('omits nullable links, note and duration when null', () => {
    const out = ActivitySchema.parse(
      transformActivityV2({
        id: 4,
        person_id: null,
        org_id: null,
        deal_id: null,
        note: null,
        duration: null,
      }),
    )
    expect(out.contact_id).toBeUndefined()
    expect(out.company_id).toBeUndefined()
    expect(out.deal_id).toBeUndefined()
    expect(out.note).toBeUndefined()
    expect(out.duration_minutes).toBeUndefined()
  })
})
