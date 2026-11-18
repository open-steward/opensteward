import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawPipelinerActivity,
} from '../../../../../../../src/verticals/crm/adapters/pipeliner/transform/activity'

function makeRaw(overrides: Partial<RawPipelinerActivity> = {}): RawPipelinerActivity {
  return { id: 'act-1', ...overrides }
}

describe('pipeliner transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw({ id: 'act-9' })).id).toBe('act-9')
  })

  it('maps subject and note', () => {
    const result = transformActivity(makeRaw({ subject: 'Call', note: 'Details' }))
    expect(result.subject).toBe('Call')
    expect(result.note).toBe('Details')
  })

  it('maps deal_id from lead_oppty_id', () => {
    expect(transformActivity(makeRaw({ lead_oppty_id: 'opp-1' })).deal_id).toBe('opp-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 'act-9' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('pipeliner untransformActivity', () => {
  it('maps deal_id to lead_oppty_id', () => {
    const result = untransformActivity({ deal_id: 'opp-5' })
    expect(result.lead_oppty_id).toBe('opp-5')
  })
})
