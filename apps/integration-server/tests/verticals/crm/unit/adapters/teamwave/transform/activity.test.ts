import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawTeamwaveActivity } from '../../../../../../../src/verticals/crm/adapters/teamwave/transform/activity'

function makeRaw(overrides: Partial<RawTeamwaveActivity> = {}): RawTeamwaveActivity {
  return { id: 5, ...overrides }
}

describe('teamwave transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('5')
  })

  it('maps organization_id to company_id', () => {
    expect(transformActivity(makeRaw({ organization_id: 3 })).company_id).toBe('3')
  })

  it('defaults done to false when not set', () => {
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw({ description: 'Called client' })).note).toBe('Called client')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('teamwave untransformActivity', () => {
  it('converts company_id to numeric organization_id', () => {
    expect(untransformActivity({ company_id: '4' }).organization_id).toBe(4)
  })
})
