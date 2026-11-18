import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawOutreachContact,
} from '../../../../../../../src/verticals/crm/adapters/outreach/transform/contact'

function makeRaw(overrides: Partial<RawOutreachContact> = {}): RawOutreachContact {
  return {
    id: '1',
    type: 'prospect',
    attributes: {},
    ...overrides,
  }
}

describe('outreach transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: '42' })).id).toBe('42')
  })

  it('maps firstName and lastName from attributes', () => {
    const result = transformContact(makeRaw({ attributes: { firstName: 'Jane', lastName: 'Doe' } }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email from emails array', () => {
    const result = transformContact(makeRaw({
      attributes: { emails: [{ email: 'jane@outreach.io' }] },
    }))
    expect(result.email).toBe('jane@outreach.io')
  })

  it('maps company_id from account relationship', () => {
    const result = transformContact(makeRaw({
      attributes: {},
      relationships: { account: { data: { id: '99', type: 'account' } } },
    }))
    expect(result.company_id).toBe('99')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: '42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('outreach untransformContact', () => {
  it('wraps output in data envelope with type prospect', () => {
    const result = untransformContact({ first_name: 'Bob' })
    expect((result.data as Record<string, unknown>)?.['type']).toBe('prospect')
  })
})
