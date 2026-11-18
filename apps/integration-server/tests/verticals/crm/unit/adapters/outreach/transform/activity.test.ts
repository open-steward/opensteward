import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  type RawOutreachActivity,
} from '../../../../../../../src/verticals/crm/adapters/outreach/transform/activity'

function makeRaw(overrides: Partial<RawOutreachActivity> = {}): RawOutreachActivity {
  return {
    id: '1',
    type: 'task',
    attributes: {},
    ...overrides,
  }
}

describe('outreach transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: '3' })).id).toBe('3')
  })

  it('maps type and note from attributes', () => {
    const result = transformActivity(makeRaw({ attributes: { type: 'call', body: 'Details' } }))
    expect(result.type).toBe('call')
    expect(result.note).toBe('Details')
  })

  it('maps contact_id from prospect relationship', () => {
    const result = transformActivity(makeRaw({
      attributes: {},
      relationships: { prospect: { data: { id: '55', type: 'prospect' } } },
    }))
    expect(result.contact_id).toBe('55')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: '3' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})
