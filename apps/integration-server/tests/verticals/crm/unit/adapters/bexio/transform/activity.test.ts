import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawBexioTask } from '../../../../../../../src/verticals/crm/adapters/bexio/transform/activity'

function makeRaw(overrides: Partial<RawBexioTask> = {}): RawBexioTask {
  return { id: 1, ...overrides }
}

describe('bexio transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps subject', () => {
    const result = transformActivity(makeRaw({ subject: 'Task 1' }))
    expect(result.subject).toBe('Task 1')
  })

  it('maps note from description', () => {
    const result = transformActivity(makeRaw({ description: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps done when todo_status_id is 2', () => {
    const result = transformActivity(makeRaw({ todo_status_id: 2 }))
    expect(result.done).toBe(true)
  })

  it('maps contact_id from contact_id', () => {
    const result = transformActivity(makeRaw({ contact_id: 10 }))
    expect(result.contact_id).toBe('10')
  })

  it('maps due_date from deadline', () => {
    const result = transformActivity(makeRaw({ deadline: '2024-06-01' }))
    expect(result.due_date).toBe('2024-06-01')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', done: true })
    expect(result).toBeDefined()
    expect(result.subject).toBe('Test')
    expect(result.todo_status_id).toBe(2)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
