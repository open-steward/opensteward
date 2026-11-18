import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawWakeupsalesActivity } from '../../../../../../../src/verticals/crm/adapters/wakeupsales/transform/activity'

function makeRaw(overrides: Partial<RawWakeupsalesActivity> = {}): RawWakeupsalesActivity {
  return { id: 'WUACT1', ...overrides }
}

describe('wakeupsales transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('WUACT1')
  })

  it('maps is_completed to done', () => {
    expect(transformActivity(makeRaw({ is_completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ is_completed: 1 })).done).toBe(true)
    expect(transformActivity(makeRaw({ is_completed: false })).done).toBe(false)
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw({ description: 'Notes here' })).note).toBe('Notes here')
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

describe('wakeupsales untransformActivity', () => {
  it('maps done to is_completed', () => {
    expect(untransformActivity({ done: true }).is_completed).toBe(true)
  })
})
