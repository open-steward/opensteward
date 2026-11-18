import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawZendeskSellTask } from '../../../../../../../src/verticals/crm/adapters/zendesk-sell/transform/activity'

function makeRaw(overrides: Partial<RawZendeskSellTask> = {}): RawZendeskSellTask {
  return { id: 5, ...overrides }
}

describe('zendesk-sell transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('5')
  })

  it('maps content to both subject and note', () => {
    const result = transformActivity(makeRaw({ content: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
    expect(result.note).toBe('Follow up')
  })

  it('sets contact_id when resource_type is contact', () => {
    const result = transformActivity(makeRaw({ resource_type: 'contact', resource_id: 11 }))
    expect(result.contact_id).toBe('11')
    expect(result.deal_id).toBeUndefined()
  })

  it('sets deal_id when resource_type is deal', () => {
    const result = transformActivity(makeRaw({ resource_type: 'deal', resource_id: 22 }))
    expect(result.deal_id).toBe('22')
    expect(result.contact_id).toBeUndefined()
  })

  it('maps completed to done', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
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

describe('zendesk-sell untransformActivity', () => {
  it('maps contact_id to contact resource', () => {
    const result = untransformActivity({ contact_id: '10' })
    expect(result.resource_type).toBe('contact')
    expect(result.resource_id).toBe(10)
  })
})
