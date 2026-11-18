import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/raynet/transform/activity'
import { TASK } from '../fixtures'

describe('raynet transformActivity (GET /task/{taskId}/ documented example)', () => {
  it('maps the documented fields and parses as a canonical Activity', () => {
    const a = ActivitySchema.parse(transformActivity(TASK))
    expect(a).toMatchObject({
      id: '89',
      type: 'task',
      subject: 'Initiate contact with account',
      note: 'You need to be kind!',
      contact_id: '3',
      company_id: '2',
      owner_id: '2',
      due_date: '2022-06-11T13:03:00.000Z',
      done: false,
      created_at: '2022-04-24T06:06:00.000Z',
      updated_at: '2022-05-17T08:46:00.000Z',
    })
    expect(a.deal_id).toBeUndefined()
    expect(a.metadata).toEqual(TASK)
  })

  it('is done once it has a completion date', () => {
    const a = ActivitySchema.parse(
      transformActivity({
        ...TASK,
        completed: '2022-06-12T09:00:00.000+02:00',
        businessCase: { id: 4 },
      }),
    )
    expect(a.done).toBe(true)
    expect(a.deal_id).toBe('4')
  })

  it('untransforms back to platform shape', () => {
    expect(untransformActivity({ subject: 'Call' }).subject).toBe('Call')
  })
})
