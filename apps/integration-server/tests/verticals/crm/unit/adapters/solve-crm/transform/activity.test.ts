import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/activity'
import type { RawSolveActivity } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/activity'

function makeRaw(overrides: Partial<RawSolveActivity> = {}): RawSolveActivity {
  return { id: '1', ...overrides }
}

describe('solve-crm transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })
  it('maps subject and type', () => {
    const result = transformActivity(makeRaw({ type: 'call', subject: 'Follow up' }))
    expect(result.type).toBe('call')
    expect(result.subject).toBe('Follow up')
  })
  it('maps note from details', () => {
    expect(transformActivity(makeRaw({ details: 'Some details' })).note).toBe('Some details')
  })
  it('maps done from completed', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
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
    const result = untransformActivity({ subject: 'Call', done: true })
    expect(result.subject).toBe('Call')
    expect(result.completed).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
