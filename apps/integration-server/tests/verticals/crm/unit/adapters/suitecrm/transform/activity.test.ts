import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/activity'
import type { RawSuiteCrmActivity } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/activity'

function makeRaw(overrides: Partial<RawSuiteCrmActivity> = {}): RawSuiteCrmActivity {
  return { id: 'a1', ...overrides }
}

describe('suitecrm transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('a1')
  })
  it('maps subject from name', () => {
    expect(transformActivity(makeRaw({ name: 'Follow up' })).subject).toBe('Follow up')
  })
  it('maps done when status is Held', () => {
    expect(transformActivity(makeRaw({ status: 'Held' })).done).toBe(true)
    expect(transformActivity(makeRaw({ status: 'Planned' })).done).toBe(false)
  })
  it('maps contact_id', () => {
    expect(transformActivity(makeRaw({ contact_id: 'c1' })).contact_id).toBe('c1')
  })
  it('maps deal_id from parent_id when parent_type is Opportunities', () => {
    const result = transformActivity(makeRaw({ parent_type: 'Opportunities', parent_id: 'opp1' }))
    expect(result.deal_id).toBe('opp1')
  })
  it('does not map deal_id if parent_type is not Opportunities', () => {
    const result = transformActivity(makeRaw({ parent_type: 'Accounts', parent_id: 'acc1' }))
    expect(result.deal_id).toBeUndefined()
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Call', done: true })
    expect(result.name).toBe('Call')
    expect(result.status).toBe('Held')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
