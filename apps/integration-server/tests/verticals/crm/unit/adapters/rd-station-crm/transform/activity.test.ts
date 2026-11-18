import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/activity'
import type { RawRdStationActivity } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/activity'

function makeRaw(overrides: Partial<RawRdStationActivity> = {}): RawRdStationActivity {
  return { _id: 'abc123', ...overrides }
}

describe('rd-station-crm transformActivity', () => {
  it('maps id from _id', () => {
    expect(transformActivity(makeRaw()).id).toBe('abc123')
  })
  it('maps type and subject', () => {
    const result = transformActivity(makeRaw({ type: 'call', subject: 'Follow up' }))
    expect(result.type).toBe('call')
    expect(result.subject).toBe('Follow up')
  })
  it('maps note from body', () => {
    expect(transformActivity(makeRaw({ body: 'Note text' })).note).toBe('Note text')
  })
  it('maps owner_id from user._id', () => {
    expect(transformActivity(makeRaw({ user: { _id: 'user1' } })).owner_id).toBe('user1')
  })
  it('handles null user', () => {
    expect(transformActivity(makeRaw({ user: null })).owner_id).toBeUndefined()
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Call', note: 'body text' })
    expect(result.subject).toBe('Call')
    expect(result.body).toBe('body text')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
