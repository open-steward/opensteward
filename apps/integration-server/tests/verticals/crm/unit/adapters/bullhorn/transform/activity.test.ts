import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawBullhornActivity } from '../../../../../../../src/verticals/crm/adapters/bullhorn/transform/activity'

function makeRaw(overrides: Partial<RawBullhornActivity> = {}): RawBullhornActivity {
  return { id: 1, ...overrides }
}

describe('bullhorn transformActivity', () => {
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

  it('maps note from description', () => {
    const result = transformActivity(makeRaw({ description: 'Details' }))
    expect(result.note).toBe('Details')
  })

  it('maps done from isCompleted', () => {
    const result = transformActivity(makeRaw({ isCompleted: true }))
    expect(result.done).toBe(true)
  })

  it('maps contact_id from clientContact.id', () => {
    const result = transformActivity(makeRaw({ clientContact: { id: 10 } }))
    expect(result.contact_id).toBe('10')
  })

  it('maps company_id from clientCorporation.id', () => {
    const result = transformActivity(makeRaw({ clientCorporation: { id: 20 } }))
    expect(result.company_id).toBe('20')
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
    expect(result.isCompleted).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
