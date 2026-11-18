import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawKommoTask,
} from '../../../../../../../src/verticals/crm/adapters/kommo/transform/activity'

function makeRaw(overrides: Partial<RawKommoTask> = {}): RawKommoTask {
  return { id: 1, ...overrides }
}

describe('kommo transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps text to subject and note', () => {
    const result = transformActivity(makeRaw({ text: 'Call client' }))
    expect(result.subject).toBe('Call client')
    expect(result.note).toBe('Call client')
  })

  it('maps contact_id when entity_type is contacts', () => {
    const result = transformActivity(makeRaw({ entity_type: 'contacts', entity_id: 3 }))
    expect(result.contact_id).toBe('3')
    expect(result.deal_id).toBeUndefined()
  })

  it('maps deal_id when entity_type is leads', () => {
    const result = transformActivity(makeRaw({ entity_type: 'leads', entity_id: 4 }))
    expect(result.deal_id).toBe('4')
    expect(result.contact_id).toBeUndefined()
  })

  it('maps is_completed to done', () => {
    expect(transformActivity(makeRaw({ is_completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ is_completed: false })).done).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 5 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('kommo untransformActivity', () => {
  it('maps subject to text', () => {
    const result = untransformActivity({ subject: 'Meeting' })
    expect(result.text).toBe('Meeting')
  })
})
