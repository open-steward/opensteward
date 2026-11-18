import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawWebcrmActivity } from '../../../../../../../src/verticals/crm/adapters/webcrm/transform/activity'

function makeRaw(overrides: Partial<RawWebcrmActivity> = {}): RawWebcrmActivity {
  return { ...overrides }
}

describe('webcrm transformActivity', () => {
  it('maps id from ActivityId', () => {
    expect(transformActivity(makeRaw({ ActivityId: 1 })).id).toBe('1')
  })

  it('maps type from ActivityType', () => {
    expect(transformActivity(makeRaw({ ActivityType: 'call' })).type).toBe('call')
  })

  it('maps subject from ActivitySubject', () => {
    expect(transformActivity(makeRaw({ ActivitySubject: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps note from ActivityNote', () => {
    expect(transformActivity(makeRaw({ ActivityNote: 'Details' })).note).toBe('Details')
  })

  it('maps contact_id from PersonId', () => {
    expect(transformActivity(makeRaw({ PersonId: 5 })).contact_id).toBe('5')
  })

  it('maps company_id from OrganisationId', () => {
    expect(transformActivity(makeRaw({ OrganisationId: 3 })).company_id).toBe('3')
  })

  it('maps deal_id from OpportunityId', () => {
    expect(transformActivity(makeRaw({ OpportunityId: 9 })).deal_id).toBe('9')
  })

  it('maps done from ActivityCompleted', () => {
    expect(transformActivity(makeRaw({ ActivityCompleted: true })).done).toBe(true)
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
    expect(result.ActivitySubject).toBe('Test')
    expect(result.ActivityType).toBe('meeting')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ ActivityId: 1 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
