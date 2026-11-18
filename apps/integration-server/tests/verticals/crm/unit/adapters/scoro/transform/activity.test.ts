/**
 * Fixture fields from the Tasks table at https://api.scoro.com/api/v2
 * (event_id "Event ID", event_name, description, is_completed, datetime_due,
 * company_id, person_id, quote_id, owner_id, created_date, modified_date).
 * "Booleans are either 1 (true) or 0 (false)."
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/scoro/transform/activity'

const TASK = {
  event_id: 48,
  event_name: 'Call the client',
  description: 'Discuss the quote',
  is_completed: 0,
  datetime_due: '2016-03-25T15:47:20+02:00',
  company_id: 30,
  person_id: 31,
  quote_id: 12,
  project_id: 7,
  owner_id: 1,
  created_date: '2016-03-20T09:00:00+02:00',
  modified_date: '2016-03-21T09:00:00+02:00',
}

describe('scoro transformActivity', () => {
  it('maps the documented task fields and parses with ActivitySchema', () => {
    const activity = ActivitySchema.parse(transformActivity(TASK))
    expect(activity).toMatchObject({
      id: '48',
      type: 'task',
      subject: 'Call the client',
      note: 'Discuss the quote',
      done: false,
      due_date: '2016-03-25T15:47:20+02:00',
      company_id: '30',
      contact_id: '31',
      deal_id: '12',
      owner_id: '1',
      created_at: '2016-03-20T09:00:00+02:00',
      updated_at: '2016-03-21T09:00:00+02:00',
    })
    expect(activity.metadata).toEqual(TASK)
  })

  it('reads is_completed 1 as done', () => {
    expect(ActivitySchema.parse(transformActivity({ ...TASK, is_completed: 1 })).done).toBe(true)
  })

  it('leaves done unknown when is_completed is absent', () => {
    expect(transformActivity({ event_id: 1 }).done).toBeUndefined()
  })

  it('throws instead of inventing an id', () => {
    expect(() => transformActivity({ event_name: 'x' })).toThrow(/no id/)
  })

  it('untransformActivity keeps its (unrebuilt) write shape', () => {
    expect(untransformActivity({ subject: 'S', done: true })).toEqual({
      subject: 'S',
      is_completed: true,
    })
  })
})
