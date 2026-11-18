import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, type RawApolloActivity } from '../../../../../../../src/verticals/crm/adapters/apollo/transform/activity'

function makeRaw(overrides: Partial<RawApolloActivity> = {}): RawApolloActivity {
  return { id: 'a1', ...overrides }
}

describe('apollo transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('a1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
