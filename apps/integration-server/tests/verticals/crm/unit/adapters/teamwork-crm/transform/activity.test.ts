import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawTeamworkActivity,
} from '../../../../../../../src/verticals/crm/adapters/teamwork-crm/transform/activity'
import { ACTIVITY } from '../fixtures'

describe('teamwork-crm transformActivity', () => {
  it('maps the documented Activity model to a canonical Activity', () => {
    const raw = { ...ACTIVITY } as RawTeamworkActivity
    const activity = ActivitySchema.parse(transformActivity(raw))
    expect(activity).toMatchObject({
      id: '3001',
      subject: 'Discovery call',
      note: 'Walk through the Q1 expansion scope',
      deal_id: '9001',
      contact_id: '101',
      due_date: '2020-06-10T15:30:00Z',
      done: true,
      duration_minutes: 30,
      created_at: '2020-03-02T09:15:00Z',
      updated_at: '2020-06-10T16:40:00Z',
    })
    expect(activity.owner_id).toBeUndefined()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('sets contact_id only when the activity has exactly one contact', () => {
    const two = {
      ...ACTIVITY,
      contacts: [
        { id: 101, type: 'contacts' },
        { id: 102, type: 'contacts' },
      ],
      contactsCount: 2,
    } as RawTeamworkActivity
    expect(transformActivity(two).contact_id).toBeUndefined()
    expect(
      transformActivity({ ...ACTIVITY, contactsCount: 4 } as RawTeamworkActivity).contact_id,
    ).toBeUndefined()
  })

  it('maps an incomplete activity with empty relationships', () => {
    const raw = {
      ...ACTIVITY,
      isComplete: false,
      deal: null,
      contacts: [],
      contactsCount: 0,
    } as RawTeamworkActivity
    const activity = ActivitySchema.parse(transformActivity(raw))
    expect(activity.done).toBe(false)
    expect(activity.deal_id).toBeUndefined()
    expect(activity.contact_id).toBeUndefined()
  })

  it('leaves duration_minutes absent for a negative or fractional duration', () => {
    for (const duration of [-5, 12.5, null]) {
      const activity = ActivitySchema.parse(
        transformActivity({ ...ACTIVITY, duration } as RawTeamworkActivity),
      )
      expect(activity.duration_minutes).toBeUndefined()
    }
  })

  it('untransforms back to the write body', () => {
    const result = untransformActivity({ subject: 'Call', done: true })
    expect(result.title).toBe('Call')
    expect(result.completed).toBe(true)
  })
})
