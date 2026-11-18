import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawBitrix24Activity } from '../../../../../../../src/verticals/crm/adapters/bitrix24/transform/activity'

function makeRaw(overrides: Partial<RawBitrix24Activity> = {}): RawBitrix24Activity {
  return { ID: '1', ...overrides }
}

describe('bitrix24 transformActivity', () => {
  it('maps ID to id string', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })

  it('maps subject from SUBJECT', () => {
    expect(transformActivity(makeRaw({ SUBJECT: 'Call' })).subject).toBe('Call')
  })

  it('maps contact_id from BINDINGS with OWNER_TYPE_ID 3', () => {
    const raw = makeRaw({ BINDINGS: [{ OWNER_TYPE_ID: 3, OWNER_ID: '99' }] })
    expect(transformActivity(raw).contact_id).toBe('99')
  })

  it('maps deal_id from BINDINGS with OWNER_TYPE_ID 2', () => {
    const raw = makeRaw({ BINDINGS: [{ OWNER_TYPE_ID: 2, OWNER_ID: '55' }] })
    expect(transformActivity(raw).deal_id).toBe('55')
  })

  it('maps done from COMPLETED Y/N', () => {
    expect(transformActivity(makeRaw({ COMPLETED: 'Y' })).done).toBe(true)
    expect(transformActivity(makeRaw({ COMPLETED: 'N' })).done).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps subject to SUBJECT', () => {
    const result = untransformActivity({ subject: 'Demo', done: true })
    expect(result.SUBJECT).toBe('Demo')
    expect(result.COMPLETED).toBe('Y')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
