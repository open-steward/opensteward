import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/activity'
import type { RawSaleSmanagoTask } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/activity'

function makeRaw(overrides: Partial<RawSaleSmanagoTask> = {}): RawSaleSmanagoTask {
  return { id: 'task1', ...overrides }
}

describe('salesmanago transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('task1')
  })
  it('maps subject and type', () => {
    const result = transformActivity(makeRaw({ subject: 'Call', type: 'call' }))
    expect(result.subject).toBe('Call')
    expect(result.type).toBe('call')
  })
  it('maps due_date from epoch ms', () => {
    const ts = new Date('2024-01-15T00:00:00Z').getTime()
    const result = transformActivity(makeRaw({ date: ts }))
    expect(result.due_date).toBe('2024-01-15T00:00:00.000Z')
  })
  it('maps done flag', () => {
    expect(transformActivity(makeRaw({ done: true })).done).toBe(true)
  })
  it('maps contact_id from contactId', () => {
    expect(transformActivity(makeRaw({ contactId: 'c1' })).contact_id).toBe('c1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Task', done: false })
    expect(result.subject).toBe('Task')
    expect(result.done).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
