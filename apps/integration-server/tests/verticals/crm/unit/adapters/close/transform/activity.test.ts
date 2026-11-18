import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawCloseActivity } from '../../../../../../../src/verticals/crm/adapters/close/transform/activity'

function makeRaw(overrides: Partial<RawCloseActivity> = {}): RawCloseActivity {
  return { id: 'act1', ...overrides }
}

describe('close transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('act1')
  })

  it('maps type from _type lowercased', () => {
    expect(transformActivity(makeRaw({ _type: 'Call' })).type).toBe('call')
  })

  it('maps duration_minutes from seconds', () => {
    expect(transformActivity(makeRaw({ duration: 120 })).duration_minutes).toBe(2)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps note', () => {
    expect(untransformActivity({ note: 'hi' }).note).toBe('hi')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
