import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/membrain/transform/activity'
import { DOC_APPOINTMENT, DOC_TASK } from '../fixtures/docs'

describe('membrain transformActivity', () => {
  it('maps the documented Task example', () => {
    const out = ActivitySchema.parse(transformActivity(DOC_TASK))
    expect(out).toMatchObject({
      id: 'b7c1ad6f-a2f5-4d85-9b38-d743434eafa4',
      type: 'task',
      note: 'No reply.',
      done: true,
      due_date: '2019-01-19T03:03:00.123456Z',
      company_id: '48105796-fa6a-4fdf-9f09-84f981c8b945',
      deal_id: '97c4d3ee-4467-4808-a8e6-b619a3077e34',
    })
    expect(out.metadata).toEqual(DOC_TASK)
  })

  it('maps Type "Activity" (an Appointment) to meeting, with no due date', () => {
    const out = ActivitySchema.parse(transformActivity(DOC_APPOINTMENT))
    expect(out.type).toBe('meeting')
    // "The Deadline field value only has significance for Tasks"
    expect(out.due_date).toBeUndefined()
    expect(out.company_id).toBe('e823397a-747e-47ff-bdd8-43818a7e33dc')
    expect(out.deal_id).toBeUndefined()
  })

  it('reads Completed "false" as not done and the 1753 placeholder as no deadline', () => {
    const out = transformActivity({
      ...DOC_TASK,
      Completed: 'false',
      Deadline: '1753-01-01 00:00:00.000000',
    })
    expect(out.done).toBe(false)
    expect(out.due_date).toBeUndefined()
  })

  it.each([
    ['Call', 'call'],
    ['Email', 'email'],
    ['Note', 'note'],
    ['Task', 'task'],
    ['Activity', 'meeting'],
  ])('maps the documented Type %s to %s', (Type, type) => {
    const out = ActivitySchema.parse(transformActivity({ ...DOC_APPOINTMENT, Type }))
    expect(out.type).toBe(type)
  })

  it('maps Subject ("Only for Appointments and Emails")', () => {
    const out = ActivitySchema.parse(
      transformActivity({ ...DOC_APPOINTMENT, Subject: 'Monthly meeting' }),
    )
    expect(out.subject).toBe('Monthly meeting')
  })

  it('omits a Task deadline whose time has no significance (HasExplicitTime "false")', () => {
    const out = ActivitySchema.parse(transformActivity({ ...DOC_TASK, HasExplicitTime: 'false' }))
    expect(out.due_date).toBeUndefined()
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', done: true })
    expect(result.subject).toBe('Test')
    expect(result.completed).toBe(true)
  })
})
