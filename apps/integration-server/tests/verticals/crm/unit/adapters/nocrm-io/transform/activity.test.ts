import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawNocrmActivity,
} from '../../../../../../../src/verticals/crm/adapters/nocrm-io/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawNocrmActivity> = {}): RawNocrmActivity {
  return {
    id: 42,
    title: 'Discovery call',
    type: 'call',
    done: false,
    date: '2026-03-01T09:00:00.000Z',
    lead_id: 99,
    user_id: 5,
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('nocrm-io transformActivity', () => {
  it('maps id (number) to string id', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps type field', () => {
    expect(transformActivity(makeRaw()).type).toBe('call')
  })

  it('maps title to subject', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Discovery call')
  })

  it('maps lead_id to deal_id string', () => {
    expect(transformActivity(makeRaw({ lead_id: 99 })).deal_id).toBe('99')
  })

  it('maps user_id to owner_id string', () => {
    expect(transformActivity(makeRaw({ user_id: 5 })).owner_id).toBe('5')
  })

  it('maps date to due_date', () => {
    expect(transformActivity(makeRaw()).due_date).toBe('2026-03-01T09:00:00.000Z')
  })

  it('maps done boolean', () => {
    expect(transformActivity(makeRaw({ done: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ done: false })).done).toBe(false)
  })

  it('maps created_at / updated_at', () => {
    const result = transformActivity(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('omits deal_id when lead_id is null', () => {
    expect(transformActivity(makeRaw({ lead_id: null })).deal_id).toBeUndefined()
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('untransformActivity maps subject, type, date, done, lead_id, user_id', () => {
    const out = untransformActivity({
      subject: 'Call',
      type: 'call',
      due_date: '2026-03-01T09:00:00.000Z',
      done: true,
      deal_id: '99',
      owner_id: '5',
    })
    expect(out['title']).toBe('Call')
    expect(out['type']).toBe('call')
    expect(out['date']).toBe('2026-03-01T09:00:00.000Z')
    expect(out['done']).toBe(true)
    expect(out['lead_id']).toBe(99)
    expect(out['user_id']).toBe(5)
  })
})
