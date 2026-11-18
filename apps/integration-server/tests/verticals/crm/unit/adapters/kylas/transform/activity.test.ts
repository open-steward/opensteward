import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawKylasActivity } from '../../../../../../../src/verticals/crm/adapters/kylas/transform/activity'

function makeRaw(overrides: Partial<RawKylasActivity> = {}): RawKylasActivity {
  return { id: 1, ...overrides }
}

describe('kylas transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps type from taskType', () => {
    const result = transformActivity(makeRaw({ taskType: 'call' }))
    expect(result.type).toBe('call')
  })

  it('maps subject from title', () => {
    const result = transformActivity(makeRaw({ title: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps note from description', () => {
    const result = transformActivity(makeRaw({ description: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps done from completed', () => {
    const result = transformActivity(makeRaw({ completed: true }))
    expect(result.done).toBe(true)
  })

  it('maps contact_id from contactId', () => {
    const result = transformActivity(makeRaw({ contactId: 5 }))
    expect(result.contact_id).toBe('5')
  })

  it('maps owner_id from ownedBy.id', () => {
    const result = transformActivity(makeRaw({ ownedBy: { id: 10 } }))
    expect(result.owner_id).toBe('10')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'meeting' })
    expect(result).toBeDefined()
    expect(result.title).toBe('Test')
    expect(result.taskType).toBe('meeting')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
