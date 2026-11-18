import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawDeskeraActivity } from '../../../../../../../src/verticals/crm/adapters/deskera/transform/activity'

function makeRaw(overrides: Partial<RawDeskeraActivity> = {}): RawDeskeraActivity {
  return { id: '1', ...overrides }
}

describe('deskera transformActivity', () => {
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

  it('maps note', () => {
    const result = transformActivity(makeRaw({ note: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps done', () => {
    const result = transformActivity(makeRaw({ done: true }))
    expect(result.done).toBe(true)
  })

  it('maps contact_id from contactId', () => {
    const result = transformActivity(makeRaw({ contactId: 'c1' }))
    expect(result.contact_id).toBe('c1')
  })

  it('maps deal_id from dealId', () => {
    const result = transformActivity(makeRaw({ dealId: 'd1' }))
    expect(result.deal_id).toBe('d1')
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
    expect(result.done).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
