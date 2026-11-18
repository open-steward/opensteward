import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawTeamgateActivity,
} from '../../../../../../../src/verticals/crm/adapters/teamgate/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawTeamgateActivity> = {}): RawTeamgateActivity {
  return { id: 1, ...overrides }
}

describe('teamgate transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('lowercases type', () => {
    const result = transformActivity(makeRaw({ type: 'Call' }))
    expect(result.type).toBe('call')
  })

  it('maps subject', () => {
    const result = transformActivity(makeRaw({ subject: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('sets done=true when status is "done"', () => {
    const result = transformActivity(makeRaw({ status: 'done' }))
    expect(result.done).toBe(true)
  })

  it('sets done=true when status is "completed"', () => {
    const result = transformActivity(makeRaw({ status: 'completed' }))
    expect(result.done).toBe(true)
  })

  it('sets done=false for status "open"', () => {
    const result = transformActivity(makeRaw({ status: 'open' }))
    expect(result.done).toBe(false)
  })

  it('extracts deal_id from first deals array entry', () => {
    const result = transformActivity(makeRaw({ deals: [{ id: 33 }] }))
    expect(result.deal_id).toBe('33')
  })

  it('maps ownerId to owner_id', () => {
    const result = transformActivity(makeRaw({ ownerId: 5 }))
    expect(result.owner_id).toBe('5')
  })

  it('normalises createdTime to ISO datetime', () => {
    const result = transformActivity(makeRaw({ createdTime: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation', () => {
    const raw = makeRaw({
      id: 99,
      type: 'call',
      subject: 'Follow up',
      status: 'open',
      deals: [{ id: 33 }],
      ownerId: 5,
      createdTime: '2026-01-15T09:30:00.000Z',
      updatedTime: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('teamgate untransformActivity', () => {
  it('maps done=true back to status "done"', () => {
    const result = untransformActivity({ done: true })
    expect(result.status).toBe('done')
  })

  it('maps done=false back to status "open"', () => {
    const result = untransformActivity({ done: false })
    expect(result.status).toBe('open')
  })

  it('maps type back to type', () => {
    const result = untransformActivity({ type: 'call' })
    expect(result.type).toBe('call')
  })

  it('omits undefined fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
