import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawBiginActivity } from '../../../../../../../src/verticals/crm/adapters/zoho-bigin/transform/activity'

function makeRaw(overrides: Partial<RawBiginActivity> = {}): RawBiginActivity {
  return { id: '1', ...overrides }
}

describe('zoho-bigin transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('1')
  })

  it('maps type from Activity_Type', () => {
    expect(transformActivity(makeRaw({ Activity_Type: 'call' })).type).toBe('call')
  })

  it('maps subject from Subject', () => {
    expect(transformActivity(makeRaw({ Subject: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps done when Status is Completed', () => {
    expect(transformActivity(makeRaw({ Status: 'Completed' })).done).toBe(true)
    expect(transformActivity(makeRaw({ Status: 'Not Started' })).done).toBe(false)
  })

  it('maps contact_id from Who_Id.id', () => {
    expect(transformActivity(makeRaw({ Who_Id: { id: '5' } })).contact_id).toBe('5')
  })

  it('maps deal_id from What_Id.id', () => {
    expect(transformActivity(makeRaw({ What_Id: { id: '9' } })).deal_id).toBe('9')
  })

  it('maps owner_id from Owner.id', () => {
    expect(transformActivity(makeRaw({ Owner: { id: '7' } })).owner_id).toBe('7')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'meeting' })
    expect(result.Subject).toBe('Test')
    expect(result.Activity_Type).toBe('meeting')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
