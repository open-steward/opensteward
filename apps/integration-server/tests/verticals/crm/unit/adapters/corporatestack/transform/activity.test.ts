import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawCorporateStackActivity } from '../../../../../../../src/verticals/crm/adapters/corporatestack/transform/activity'

function makeRaw(overrides: Partial<RawCorporateStackActivity> = {}): RawCorporateStackActivity {
  return { id: '1', ...overrides }
}

describe('corporatestack transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps type', () => {
    const result = transformActivity(makeRaw({ type: 'call' }))
    expect(result.type).toBe('call')
  })

  it('maps subject', () => {
    const result = transformActivity(makeRaw({ subject: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps done from completed', () => {
    const result = transformActivity(makeRaw({ completed: true }))
    expect(result.done).toBe(true)
  })

  it('maps contact_id from contact_id', () => {
    const result = transformActivity(makeRaw({ contact_id: 'c1' }))
    expect(result.contact_id).toBe('c1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', done: true })
    expect(result).toBeDefined()
    expect(result.subject).toBe('Test')
    expect(result.completed).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
