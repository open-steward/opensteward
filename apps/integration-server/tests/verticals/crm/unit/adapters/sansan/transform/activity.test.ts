import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, type RawSansanActivity } from '../../../../../../../src/verticals/crm/adapters/sansan/transform/activity'

function makeRaw(overrides: Partial<RawSansanActivity> = {}): RawSansanActivity {
  return { id: 'A1', ...overrides }
}

describe('sansan transformActivity (placeholder)', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('A1')
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
