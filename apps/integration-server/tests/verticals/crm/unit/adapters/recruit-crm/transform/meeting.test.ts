/**
 * Fixture: the documented example values of the Meeting model in the Recruit
 * CRM API reference (https://docs.recruitcrm.io/docs/rcrm-api-reference/5ded6e12da789-meeting).
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformMeeting,
  type RawRecruitCrmMeeting,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/meeting'

const DOC_MEETING: RawRecruitCrmMeeting = {
  id: 2,
  title: 'Follow up call',
  meeting_type: [{ id: 1, label: 'Client Meeting' }],
  description: 'Make follow up call for interview',
  address: 'Video call (https://examplelink)',
  reminder: 30,
  start_date: '2020-06-29T05:36:22.000000Z',
  end_date: '2020-06-29T06:36:22.000000Z',
  related_to: '23123',
  related_to_type: 'candidate',
  do_not_send_calendar_invites: '1',
  reminder_date: '2022-12-02T16:30:00.000000Z',
  owner: '10023',
  created_on: '2022-12-02T16:59:24.000000Z',
  updated_on: '2022-12-02T16:59:24.000000Z',
  created_by: '10002',
  updated_by: '10002',
}

describe('recruit-crm transformMeeting', () => {
  it('maps the documented example to a canonical activity', () => {
    const out = ActivitySchema.parse(transformMeeting(DOC_MEETING))
    expect(out).toEqual({
      id: 'meeting_2',
      type: 'meeting',
      subject: 'Follow up call',
      note: 'Make follow up call for interview',
      due_date: '2020-06-29T05:36:22.000Z',
      owner_id: '10023',
      created_at: '2022-12-02T16:59:24.000Z',
      updated_at: '2022-12-02T16:59:24.000Z',
      metadata: DOC_MEETING,
    })
  })

  it('reads created_at from created_on and updated_at from updated_on', () => {
    // The documented example gives both fields one value, so pin them apart.
    const out = transformMeeting({
      ...DOC_MEETING,
      created_on: '2022-01-01T00:00:00.000000Z',
      updated_on: '2023-06-15T12:30:00.000000Z',
    })
    expect(out.created_at).toBe('2022-01-01T00:00:00.000Z')
    expect(out.updated_at).toBe('2023-06-15T12:30:00.000Z')
  })

  it('parses with only the id present', () => {
    expect(ActivitySchema.parse(transformMeeting({ id: 9 })).id).toBe('meeting_9')
  })

  it('throws on a meeting with no id', () => {
    expect(() => transformMeeting({} as RawRecruitCrmMeeting)).toThrow(/no id/)
  })
})
