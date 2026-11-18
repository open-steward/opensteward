import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/spotler-crm/transform/activity'

describe('spotler-crm transformActivity', () => {
  it('maps the documented id and keeps the record as metadata', () => {
    const raw = { id: 7, somefield: 'kept raw' }
    const activity = ActivitySchema.parse(transformActivity(raw))
    expect(activity.id).toBe('7')
    expect(activity.metadata).toEqual(raw)
  })

  it('maps no undocumented field', () => {
    const raw = { id: 7, tasktype: 'call', description: 'Follow up', done: true }
    const activity = ActivitySchema.parse(transformActivity(raw))
    expect(activity.type).toBeUndefined()
    expect(activity.subject).toBeUndefined()
    expect(activity.done).toBeUndefined()
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Call', type: 'call' })
    expect(result.description).toBe('Call')
    expect(result.tasktype).toBe('call')
  })
})
