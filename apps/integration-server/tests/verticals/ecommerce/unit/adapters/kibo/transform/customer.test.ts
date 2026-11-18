import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawKiboCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/kibo/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawKiboCustomer> = {}): RawKiboCustomer {
  return {
    id: 12345,
    emailAddress: 'jane.doe@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    acceptsMarketing: true,
    isActive: true,
    orderCount: 7,
    lifetimeValue: 1250.50,
    currencyCode: 'USD',
    contacts: [
      {
        id: 1,
        firstName: 'Jane',
        lastNameOrSurname: 'Doe',
        emailAddress: 'jane.doe@example.com',
        phoneNumbers: {
          home: '555-1234',
          mobile: '555-9876',
        },
        address: {
          address1: '456 Oak Ave',
          address2: 'Suite 200',
          cityOrTown: 'Portland',
          stateOrProvince: 'OR',
          postalOrZipCode: '97201',
          countryCode: 'US',
        },
        isPrimary: true,
      },
    ],
    auditInfo: {
      createDate: '2023-09-01T08:00:00Z',
      updateDate: '2024-04-15T16:00:00Z',
    },
    ...overrides,
  }
}

// ── Core fields ───────────────────────────────────────────────────────────────

describe('transformCustomer (Kibo)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('12345')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.acceptsMarketing).toBe(true)
    expect(result.createdAt).toBe('2023-09-01T08:00:00Z')
    expect(result.updatedAt).toBe('2024-04-15T16:00:00Z')
  })

  it('stringifies integer customer id', () => {
    const result = transformCustomer(makeCustomer({ id: 99999 }))
    expect(result.id).toBe('99999')
    expect(typeof result.id).toBe('string')
  })

  it('maps ordersCount', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(7)
  })

  it('maps totalSpent from lifetimeValue', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 125050, currency: 'USD' })
  })

  it('prefers lifetimeValueExclTax over lifetimeValue', () => {
    const result = transformCustomer(
      makeCustomer({ lifetimeValue: 1250.50, lifetimeValueExclTax: 1100.00 }),
    )
    expect(result.totalSpent?.amount).toBe(110000)
  })

  it('maps phone from mobile number (preferred)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('555-9876')
  })

  it('falls back to home phone when no mobile', () => {
    const customer = makeCustomer()
    customer.contacts![0]!.phoneNumbers = { home: '555-1234' }
    const result = transformCustomer(customer)
    expect(result.phone).toBe('555-1234')
  })

  it('maps default address from primary contact', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.line1).toBe('456 Oak Ave')
    expect(result.defaultAddress!.line2).toBe('Suite 200')
    expect(result.defaultAddress!.city).toBe('Portland')
    expect(result.defaultAddress!.region).toBe('OR')
    expect(result.defaultAddress!.postalCode).toBe('97201')
    expect(result.defaultAddress!.country).toBe('US')
  })

  it('maps all contacts as addresses', () => {
    const customer = makeCustomer()
    customer.contacts!.push({
      id: 2,
      address: {
        address1: '789 Pine Rd',
        cityOrTown: 'Seattle',
        stateOrProvince: 'WA',
        postalOrZipCode: '98101',
        countryCode: 'US',
      },
      isPrimary: false,
    })
    const result = transformCustomer(customer)
    expect(result.addresses).toHaveLength(2)
  })

  it('handles missing contacts gracefully', () => {
    const result = transformCustomer(makeCustomer({ contacts: undefined }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('handles empty contacts array', () => {
    const result = transformCustomer(makeCustomer({ contacts: [] }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles completely empty customer object', () => {
    const result = transformCustomer({})
    expect(result.id).toBe('')
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD for totalSpent when currencyCode missing', () => {
    const result = transformCustomer(makeCustomer({ currencyCode: undefined, lifetimeValue: 500 }))
    expect(result.totalSpent).toEqual({ amount: 50000, currency: 'USD' })
  })
})
