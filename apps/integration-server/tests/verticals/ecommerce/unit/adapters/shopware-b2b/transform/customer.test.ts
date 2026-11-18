import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopwareB2BCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeB2BCustomer(overrides: Partial<RawShopwareB2BCustomer> = {}): RawShopwareB2BCustomer {
  return {
    id: 'cust-b2b-001',
    customerNumber: 'B2B-1001',
    email: 'einkauf@acme-gmbh.de',
    firstName: 'Max',
    lastName: 'Mustermann',
    company: 'ACME GmbH',
    active: true,
    guest: false,
    orderCount: 47,
    b2bCompany: {
      id: 'company-001',
      name: 'ACME GmbH',
      status: 'active',
      customerNumber: 'B2B-1001',
    },
    b2bEmployees: [
      {
        id: 'emp-001',
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max@acme-gmbh.de',
        role: { id: 'role-admin', name: 'Admin' },
        active: true,
      },
      {
        id: 'emp-002',
        firstName: 'Erika',
        lastName: 'Musterfrau',
        email: 'erika@acme-gmbh.de',
        role: { id: 'role-buyer', name: 'Buyer' },
        active: true,
      },
    ],
    b2bBudgets: [
      {
        id: 'budget-001',
        name: 'Q1 Office Supplies',
        amount: 5000,
        currency: 'EUR',
        spent: 1234.56,
        active: true,
      },
    ],
    b2bRoles: [
      { id: 'role-admin', name: 'Admin', permissions: ['*'] },
      { id: 'role-buyer', name: 'Buyer', permissions: ['order.create', 'cart.manage'] },
    ],
    defaultBillingAddress: {
      id: 'addr-1',
      street: 'Industriestrasse 10',
      additionalAddressLine1: 'Gebaeude B',
      zipcode: '70173',
      city: 'Stuttgart',
      country: { iso: 'DE', name: 'Germany' },
      countryState: { shortCode: 'DE-BW', name: 'Baden-Wuerttemberg' },
      phoneNumber: '+49 711 1234567',
    },
    addresses: [
      {
        id: 'addr-1',
        street: 'Industriestrasse 10',
        additionalAddressLine1: 'Gebaeude B',
        zipcode: '70173',
        city: 'Stuttgart',
        country: { iso: 'DE', name: 'Germany' },
        countryState: { shortCode: 'DE-BW', name: 'Baden-Wuerttemberg' },
        phoneNumber: '+49 711 1234567',
      },
    ],
    createdAt: '2024-01-05T08:00:00+00:00',
    updatedAt: '2024-06-15T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformCustomer (Shopware B2B)', () => {
  it('uses B2B company name as firstName (lossy mapping)', () => {
    const result = transformCustomer(makeB2BCustomer())
    expect(result.firstName).toBe('ACME GmbH')
    expect(result.lastName).toBeUndefined()
  })

  it('falls back to regular firstName/lastName when no B2B company', () => {
    const result = transformCustomer(makeB2BCustomer({
      b2bCompany: null,
      company: null,
    }))
    expect(result.firstName).toBe('Max')
    expect(result.lastName).toBe('Mustermann')
  })

  it('uses company field when b2bCompany is absent', () => {
    const result = transformCustomer(makeB2BCustomer({
      b2bCompany: null,
    }))
    expect(result.firstName).toBe('ACME GmbH')
    expect(result.lastName).toBeUndefined()
  })

  it('maps core fields', () => {
    const result = transformCustomer(makeB2BCustomer())
    expect(result.id).toBe('cust-b2b-001')
    expect(result.email).toBe('einkauf@acme-gmbh.de')
    expect(result.phone).toBe('+49 711 1234567')
    expect(result.ordersCount).toBe(47)
  })

  it('maps default billing address', () => {
    const result = transformCustomer(makeB2BCustomer())
    expect(result.defaultAddress).toMatchObject({
      line1: 'Industriestrasse 10',
      line2: 'Gebaeude B',
      city: 'Stuttgart',
      region: 'Baden-Wuerttemberg',
      postalCode: '70173',
      country: 'DE',
    })
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeB2BCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.city).toBe('Stuttgart')
  })

  it('handles missing default address — falls back to first address', () => {
    const result = transformCustomer(makeB2BCustomer({ defaultBillingAddress: null }))
    expect(result.defaultAddress?.city).toBe('Stuttgart')
  })

  it('handles no addresses at all', () => {
    const result = transformCustomer(
      makeB2BCustomer({ defaultBillingAddress: null, addresses: [] }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves B2B employees in metadata', () => {
    const raw = makeB2BCustomer()
    const result = transformCustomer(raw)
    const meta = result.metadata as Record<string, unknown>
    const employees = meta['b2bEmployees'] as Array<Record<string, unknown>>
    expect(employees).toHaveLength(2)
    expect(employees[0]!['firstName']).toBe('Max')
    expect(employees[1]!['email']).toBe('erika@acme-gmbh.de')
  })

  it('preserves B2B budgets in metadata', () => {
    const raw = makeB2BCustomer()
    const result = transformCustomer(raw)
    const meta = result.metadata as Record<string, unknown>
    const budgets = meta['b2bBudgets'] as Array<Record<string, unknown>>
    expect(budgets).toHaveLength(1)
    expect(budgets[0]!['name']).toBe('Q1 Office Supplies')
    expect(budgets[0]!['amount']).toBe(5000)
  })

  it('preserves B2B roles in metadata', () => {
    const raw = makeB2BCustomer()
    const result = transformCustomer(raw)
    const meta = result.metadata as Record<string, unknown>
    const roles = meta['b2bRoles'] as Array<Record<string, unknown>>
    expect(roles).toHaveLength(2)
    expect(roles[0]!['name']).toBe('Admin')
    expect(roles[1]!['name']).toBe('Buyer')
  })

  it('preserves B2B company info in metadata', () => {
    const raw = makeB2BCustomer()
    const result = transformCustomer(raw)
    const meta = result.metadata as Record<string, unknown>
    const company = meta['b2bCompany'] as Record<string, unknown>
    expect(company['name']).toBe('ACME GmbH')
    expect(company['status']).toBe('active')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeB2BCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('validates against CustomerSchema', () => {
    const result = transformCustomer(makeB2BCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('validates when no B2B data present', () => {
    const result = transformCustomer(makeB2BCustomer({
      b2bCompany: null,
      company: null,
      b2bEmployees: undefined,
      b2bBudgets: undefined,
      b2bRoles: undefined,
    }))
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Shopware B2B)', () => {
  it('maps canonical fields to Shopware shape', () => {
    const body = untransformCustomer({
      email: 'einkauf@acme-gmbh.de',
      firstName: 'ACME GmbH',
      lastName: undefined,
      phone: '+49 711 9876543',
      defaultAddress: {
        line1: 'Friedrichstrasse 1',
        city: 'Berlin',
        postalCode: '10117',
        country: 'DE',
      },
    })
    expect(body['email']).toBe('einkauf@acme-gmbh.de')
    expect(body['firstName']).toBe('ACME GmbH')
    expect(body['company']).toBe('ACME GmbH')
    const addr = body['defaultBillingAddress'] as Record<string, unknown>
    expect(addr['street']).toBe('Friedrichstrasse 1')
    expect(addr['city']).toBe('Berlin')
  })

  it('sets company field from firstName for B2B reverse mapping', () => {
    const body = untransformCustomer({
      firstName: 'Test Corp',
    })
    expect(body['company']).toBe('Test Corp')
  })
})
