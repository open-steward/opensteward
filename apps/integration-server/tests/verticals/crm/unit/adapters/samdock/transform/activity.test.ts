import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/samdock/transform/activity'
import type { RawSamdockActivity } from '../../../../../../../src/verticals/crm/adapters/samdock/transform/activity'

function makeRaw(overrides: Partial<RawSamdockActivity> = {}): RawSamdockActivity {
  return { id: 'a1', ...overrides }
}

describe('samdock transformActivity', () => {
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
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test' })
    expect(result).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
