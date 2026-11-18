import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawCapsuleActivity } from '../../../../../../../src/verticals/crm/adapters/capsule/transform/activity'

function makeRaw(overrides: Partial<RawCapsuleActivity> = {}): RawCapsuleActivity {
  return { id: 1, ...overrides }
}

describe('capsule transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })

  it('maps type from category.name', () => {
    expect(transformActivity(makeRaw({ category: { name: 'Call' } })).type).toBe('Call')
  })

  it('maps subject from description', () => {
    expect(transformActivity(makeRaw({ description: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps done from completedOn not null', () => {
    expect(transformActivity(makeRaw({ completedOn: '2024-01-01' })).done).toBe(true)
    expect(transformActivity(makeRaw({ completedOn: null })).done).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps subject to description', () => {
    const result = untransformActivity({ subject: 'Demo' })
    expect(result.description).toBe('Demo')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
