import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawSalesflareActivity,
} from '../../../../../../../src/verticals/crm/adapters/salesflare/transform/activity'

function makeRaw(overrides: Partial<RawSalesflareActivity> = {}): RawSalesflareActivity {
  return { id: 1, ...overrides }
}

describe('salesflare transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 9 })).id).toBe('9')
  })

  it('maps type from type.name', () => {
    expect(transformActivity(makeRaw({ type: { id: 1, name: 'Call' } })).type).toBe('Call')
  })

  it('maps subject from description', () => {
    expect(transformActivity(makeRaw({ description: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps done from completed', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ completed: false })).done).toBe(false)
  })

  it('maps company_id from account.id', () => {
    const result = transformActivity(makeRaw({ account: { id: 4 } }))
    expect(result.company_id).toBe('4')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 9 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('salesflare untransformActivity', () => {
  it('maps subject to description', () => {
    const result = untransformActivity({ subject: 'Demo call' })
    expect(result.description).toBe('Demo call')
  })
})
