import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawActActivity } from '../../../../../../../src/verticals/crm/adapters/act-crm/transform/activity'

function makeRaw(overrides: Partial<RawActActivity> = {}): RawActActivity {
  return { id: '1', ...overrides }
}

describe('act-crm transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('falls back to activityId when id is missing', () => {
    const result = transformActivity(makeRaw({ id: undefined, activityId: '99' }))
    expect(result.id).toBe('99')
  })

  it('maps type from activityType', () => {
    const result = transformActivity(makeRaw({ activityType: 'call' }))
    expect(result.type).toBe('call')
  })

  it('maps subject', () => {
    const result = transformActivity(makeRaw({ subject: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps note from details', () => {
    const result = transformActivity(makeRaw({ details: 'some details' }))
    expect(result.note).toBe('some details')
  })

  it('maps done from isCompleted', () => {
    const result = transformActivity(makeRaw({ isCompleted: true }))
    expect(result.done).toBe(true)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'call' })
    expect(result).toBeDefined()
    expect(result.subject).toBe('Test')
    expect(result.activityType).toBe('call')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
