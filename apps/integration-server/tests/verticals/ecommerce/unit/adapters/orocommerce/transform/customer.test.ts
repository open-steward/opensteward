import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawOroCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawOroCustomer> = {}): RawOroCustomer {
  return {
    id: '100',
    name: 'Acme Industrial GmbH',
    email: 'procurement@acme-industrial.de',
    phone: '+49-30-9876543',
    lifetime: 250000,
    parent: { id: '50' },
    group: { id: '3' },
    owner: { id: 'user-1' },
    users: [
      { id: 'user-1', email: 'hans@acme-industrial.de', firstName: 'Hans', lastName: 'Mueller' },
      { id: 'user-2', email: 'anna@acme-industrial.de', firstName: 'Anna', lastName: 'Schmidt' },
    ],
    priceList: { id: 'pl-7' },
    createdAt: '2024-01-15T09:00:00.000Z',
    updatedAt: '2024-06-10T16:00:00.000Z',
    _type: 'customers',
    ...overrides,
  }
}

describe('transformCustomer (OroCommerce)', () => {
  it('maps company name to firstName (B2B mapping)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('100')
    expect(result.firstName).toBe('Acme Industrial GmbH')
    expect(result.lastName).toBeUndefined()
    expect(result.email).toBe('procurement@acme-industrial.de')
  })

  it('falls back to first CustomerUser email when Customer email is missing', () => {
    const result = transformCustomer(makeCustomer({ email: undefined }))
    expect(result.email).toBe('hans@acme-industrial.de')
  })

  it('includes B2B-specific fields in metadata', () => {
    const result = transformCustomer(makeCustomer())
    const meta = result.metadata as Record<string, unknown>
    expect(meta['companyName']).toBe('Acme Industrial GmbH')
    expect(meta['parentCustomerId']).toBe('50')
    expect(meta['customerGroupId']).toBe('3')
    expect(meta['priceListId']).toBe('pl-7')
    expect(meta['b2bNote']).toContain('company/account')
  })

  it('includes customerUsers summaries in metadata', () => {
    const result = transformCustomer(makeCustomer())
    const users = (result.metadata as Record<string, unknown>)['customerUsers'] as Array<Record<string, unknown>>
    expect(users).toHaveLength(2)
    expect(users[0]!['firstName']).toBe('Hans')
    expect(users[1]!['email']).toBe('anna@acme-industrial.de')
  })

  it('maps lifetime to totalSpent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 25000000, currency: 'USD' })
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips company name via untransformCustomer', () => {
    const body = untransformCustomer({ firstName: 'Test Corp' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('customers')
    expect(body.data.attributes['name']).toBe('Test Corp')
  })
})
