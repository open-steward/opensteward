import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawOnePageCrmAction,
} from '../../../../../../../src/verticals/crm/adapters/onepagecrm/transform/activity'

function makeRaw(overrides: Partial<RawOnePageCrmAction> = {}): RawOnePageCrmAction {
  return { id: '1', ...overrides }
}

describe('onepagecrm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: '9' })).id).toBe('9')
  })

  it('always sets type to task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps subject from text', () => {
    expect(transformActivity(makeRaw({ text: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps contact_id and deal_id', () => {
    const result = transformActivity(makeRaw({ contact_id: 'c1', deal_id: 'd1' }))
    expect(result.contact_id).toBe('c1')
    expect(result.deal_id).toBe('d1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: '9' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('onepagecrm untransformActivity', () => {
  it('maps subject to text', () => {
    const result = untransformActivity({ subject: 'Call' })
    expect(result['text']).toBe('Call')
  })
})
