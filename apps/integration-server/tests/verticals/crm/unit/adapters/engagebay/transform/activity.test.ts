import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawEngageBayTask,
} from '../../../../../../../src/verticals/crm/adapters/engagebay/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawEngageBayTask> = {}): RawEngageBayTask {
  return { id: 1, ...overrides }
}

describe('engagebay transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps TODO type to task', () => {
    expect(transformActivity(makeRaw({ type: 'TODO' })).type).toBe('task')
  })

  it('maps EMAIL type to email', () => {
    expect(transformActivity(makeRaw({ type: 'EMAIL' })).type).toBe('email')
  })

  it('maps CALL type to call', () => {
    expect(transformActivity(makeRaw({ type: 'CALL' })).type).toBe('call')
  })

  it('maps name to subject', () => {
    expect(transformActivity(makeRaw({ name: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw({ description: 'Call notes' })).note).toBe('Call notes')
  })

  it('maps completed milestone to done=true', () => {
    expect(transformActivity(makeRaw({ task_milestone: 'completed' })).done).toBe(true)
  })

  it('maps non-completed milestone to done=false', () => {
    expect(transformActivity(makeRaw({ task_milestone: 'not_started' })).done).toBe(false)
  })

  it('maps first contact_id from array', () => {
    expect(transformActivity(makeRaw({ contact_ids: [123, 456] })).contact_id).toBe('123')
  })

  it('maps first company_id from array', () => {
    expect(transformActivity(makeRaw({ company_ids: [7] })).company_id).toBe('7')
  })

  it('maps first deal_id from array', () => {
    expect(transformActivity(makeRaw({ deal_ids: [42] })).deal_id).toBe('42')
  })

  it('maps owner_id to string', () => {
    expect(transformActivity(makeRaw({ owner_id: 10 })).owner_id).toBe('10')
  })

  it('converts epoch ms closed_date to ISO datetime', () => {
    const result = transformActivity(makeRaw({ closed_date: 1700000000000 }))
    expect(result.due_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation with full input', () => {
    const raw: RawEngageBayTask = {
      id: 1,
      name: 'Discovery call',
      description: 'Discuss Q1 expansion',
      type: 'CALL',
      task_milestone: 'completed',
      closed_date: 1700000000000,
      contact_ids: [101],
      company_ids: [201],
      deal_ids: [301],
      owner_id: 5,
      created_time: 1699000000000,
      updated_time: 1700000000000,
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('engagebay untransformActivity', () => {
  it('maps subject back to name', () => {
    expect(untransformActivity({ subject: 'Call' }).name).toBe('Call')
  })

  it('maps type task back to TODO', () => {
    expect(untransformActivity({ type: 'task' }).type).toBe('TODO')
  })

  it('maps type email back to EMAIL', () => {
    expect(untransformActivity({ type: 'email' }).type).toBe('EMAIL')
  })

  it('maps done=true to completed milestone', () => {
    expect(untransformActivity({ done: true }).task_milestone).toBe('completed')
  })

  it('maps done=false to not_started milestone', () => {
    expect(untransformActivity({ done: false }).task_milestone).toBe('not_started')
  })

  it('wraps contact_id in array as number', () => {
    const result = untransformActivity({ contact_id: '123' })
    expect(result.contact_ids).toEqual([123])
  })

  it('converts owner_id to number', () => {
    expect(untransformActivity({ owner_id: '5' }).owner_id).toBe(5)
  })

  it('converts due_date ISO to epoch ms', () => {
    const result = untransformActivity({ due_date: '2023-11-14T22:13:20.000Z' })
    expect(typeof result.closed_date).toBe('number')
  })

  it('omits unset fields', () => {
    const result = untransformActivity({})
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('type')
  })
})
