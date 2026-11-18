import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawZnodeAccount,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeAccount(overrides: Partial<RawZnodeAccount> = {}): RawZnodeAccount {
  return {
    AccountId: 100,
    AccountName: 'Acme Industrial GmbH',
    Email: 'procurement@acme-industrial.de',
    PhoneNumber: '+49-30-9876543',
    LifetimeRevenue: 250000,
    CurrencyCode: 'EUR',
    ParentAccountId: 50,
    AccountTypeId: 3,
    PriceListId: 7,
    Users: [
      { UserId: 1, Email: 'hans@acme-industrial.de', FirstName: 'Hans', LastName: 'Mueller' },
      { UserId: 2, Email: 'anna@acme-industrial.de', FirstName: 'Anna', LastName: 'Schmidt' },
    ],
    CreatedDate: '2024-01-15T09:00:00.000Z',
    ModifiedDate: '2024-06-10T16:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (Znode)', () => {
  it('maps company name to firstName (B2B mapping)', () => {
    const result = transformCustomer(makeAccount())
    expect(result.id).toBe('100')
    expect(result.firstName).toBe('Acme Industrial GmbH')
    expect(result.lastName).toBeUndefined()
    expect(result.email).toBe('procurement@acme-industrial.de')
  })

  it('falls back to first AccountUser email when Account email is missing', () => {
    const result = transformCustomer(makeAccount({ Email: undefined }))
    expect(result.email).toBe('hans@acme-industrial.de')
  })

  it('includes B2B-specific fields in metadata', () => {
    const result = transformCustomer(makeAccount())
    const meta = result.metadata as Record<string, unknown>
    expect(meta['companyName']).toBe('Acme Industrial GmbH')
    expect(meta['parentAccountId']).toBe('50')
    expect(meta['accountTypeId']).toBe('3')
    expect(meta['priceListId']).toBe('7')
    expect(meta['b2bNote']).toContain('company/organization')
  })

  it('includes accountUsers summaries in metadata', () => {
    const result = transformCustomer(makeAccount())
    const users = (result.metadata as Record<string, unknown>)['accountUsers'] as Array<Record<string, unknown>>
    expect(users).toHaveLength(2)
    expect(users[0]!['firstName']).toBe('Hans')
    expect(users[1]!['email']).toBe('anna@acme-industrial.de')
  })

  it('maps LifetimeRevenue to totalSpent with currency', () => {
    const result = transformCustomer(makeAccount())
    expect(result.totalSpent).toEqual({ amount: 25000000, currency: 'EUR' })
  })

  it('defaults totalSpent currency to USD when CurrencyCode is absent', () => {
    const result = transformCustomer(makeAccount({ CurrencyCode: undefined }))
    expect(result.totalSpent).toEqual({ amount: 25000000, currency: 'USD' })
  })

  it('handles null parent and type ids', () => {
    const result = transformCustomer(makeAccount({ ParentAccountId: null, AccountTypeId: null }))
    const meta = result.metadata as Record<string, unknown>
    expect(meta['parentAccountId']).toBeUndefined()
    expect(meta['accountTypeId']).toBeUndefined()
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeAccount())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips company name via untransformCustomer', () => {
    const body = untransformCustomer({ firstName: 'Test Corp' }) as Record<string, unknown>
    expect(body['AccountName']).toBe('Test Corp')
  })
})
