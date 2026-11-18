import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawHoldedActivity } from '../../../../../../../src/verticals/crm/adapters/holded/transform/activity'

function makeRaw(overrides: Partial<RawHoldedActivity> = {}): RawHoldedActivity {
  return { id: '1', ...overrides }
}

describe('holded transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test' })
    expect(result).toBeDefined()
    expect(result.subject).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
