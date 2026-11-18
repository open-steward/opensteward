import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/activity'
import type { RawQiscusActivity } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/activity'

function makeRaw(overrides: Partial<RawQiscusActivity> = {}): RawQiscusActivity {
  return { id: '1', ...overrides }
}

describe('qiscus transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })
  it('maps type and subject', () => {
    const result = transformActivity(makeRaw({ type: 'call', subject: 'Follow up' }))
    expect(result.type).toBe('call')
    expect(result.subject).toBe('Follow up')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'task' })
    expect(result).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
