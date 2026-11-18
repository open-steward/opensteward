import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawSalesflareContact,
} from '../../../../../../../src/verticals/crm/adapters/salesflare/transform/contact'

function makeRaw(overrides: Partial<RawSalesflareContact> = {}): RawSalesflareContact {
  return { id: 1, ...overrides }
}

describe('salesflare transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps firstname and lastname', () => {
    const result = transformContact(makeRaw({ firstname: 'Jane', lastname: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email from string', () => {
    expect(transformContact(makeRaw({ email: 'jane@sf.com' })).email).toBe('jane@sf.com')
  })

  it('maps email from array', () => {
    expect(transformContact(makeRaw({ email: ['arr@sf.com', 'other@sf.com'] })).email).toBe('arr@sf.com')
  })

  it('maps company_id from account_id', () => {
    expect(transformContact(makeRaw({ account_id: 5 })).company_id).toBe('5')
  })

  it('maps tags', () => {
    expect(transformContact(makeRaw({ tags: ['vip'] })).tags).toEqual(['vip'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('salesflare untransformContact', () => {
  it('maps first_name to firstname', () => {
    const result = untransformContact({ first_name: 'Bob' })
    expect(result.firstname).toBe('Bob')
  })
})
