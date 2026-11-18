import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/activity'
import type { RawPloomesActivity } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/activity'

/**
 * Built from the documented /Tasks example body
 * (https://developers.ploomes.com/json/openapi.json):
 *   {"Title":"Título da tarefa","Description":"Descrição teste",
 *    "DateTime":"2016-11-03T15:00:00","ContactId":0, ...}
 * plus the documented Id, TypeId and DealId fields.
 */
function makeRaw(overrides: Partial<RawPloomesActivity> = {}): RawPloomesActivity {
  return {
    Id: 3001,
    Title: 'Título da tarefa',
    Description: 'Descrição teste',
    DateTime: '2016-11-03T15:00:00',
    TypeId: 1,
    ContactId: 23,
    DealId: null,
    ...overrides,
  }
}

describe('ploomes transformActivity', () => {
  it('parses against the canonical schema', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })
  it('maps Id, Title to subject and Description to note', () => {
    const a = transformActivity(makeRaw())
    expect(a.id).toBe('3001')
    expect(a.subject).toBe('Título da tarefa')
    expect(a.note).toBe('Descrição teste')
  })
  it('maps ContactId and DealId, omitting null', () => {
    expect(transformActivity(makeRaw()).contact_id).toBe('23')
    expect(transformActivity(makeRaw()).deal_id).toBeUndefined()
    expect(transformActivity(makeRaw({ DealId: 55 })).deal_id).toBe('55')
  })
  it('does not turn the TypeId into a type name', () => {
    expect(transformActivity(makeRaw()).type).toBeUndefined()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Call', done: true })
    expect(result.Description).toBe('Call')
    expect(result.Done).toBe(true)
  })
})
