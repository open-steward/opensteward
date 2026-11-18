import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawMauticActivity } from '../../../../../../../src/verticals/crm/adapters/mautic/transform/activity'

function makeRaw(overrides: Partial<RawMauticActivity> = {}): RawMauticActivity {
  return { id: '1', ...overrides }
}

describe('mautic transformActivity', () => {
  it('maps id', () => {
    const result = transformActivity(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps type from eventType', () => {
    const result = transformActivity(makeRaw({ eventType: 'form.submitted' }))
    expect(result.type).toBe('form.submitted')
  })

  it('maps done as true always', () => {
    const result = transformActivity(makeRaw())
    expect(result.done).toBe(true)
  })

  it('maps contact_id from contactId', () => {
    const result = transformActivity(makeRaw({ contactId: 'c1' }))
    expect(result.contact_id).toBe('c1')
  })

  it('maps due_date from timestamp', () => {
    const result = transformActivity(makeRaw({ timestamp: '2024-06-01' }))
    expect(result.due_date).toBe('2024-06-01')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ type: 'form.submitted', contact_id: 'c1' })
    expect(result).toBeDefined()
    expect(result.eventType).toBe('form.submitted')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
