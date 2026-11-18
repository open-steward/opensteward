import { describe, it, expect } from 'vitest'
import {
  transformClient,
  type Bill4TimeClient,
} from '../../../../../../../src/verticals/accounting/adapters/bill4time/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<Bill4TimeClient> = {}): Bill4TimeClient {
  return {
    InternalClientID: 'IC-001',
    ClientID: 'ACME',
    FirstName: 'Jane',
    LastName: 'Doe',
    CompanyName: 'Acme Corp',
    Email: 'jane@acme.com',
    Phone: '+15551234567',
    MobilePhone: '+15559876543',
    Fax: '+15554444444',
    Address: '100 Main Street',
    Address2: 'Suite 5',
    City: 'Austin',
    State: 'TX',
    Zip: '78701',
    Country: 'US',
    IsActive: true,
    Currency: 'USD',
    Notes: 'VIP client',
    ...overrides,
  }
}

describe('transformClient (bill4time)', () => {
  it('maps core fields correctly', () => {
    const result = transformClient(makeRaw())
    expect(result.id).toBe('IC-001')
    expect(result.identification).toBe('ACME')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.companyName).toBe('Acme Corp')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.currency).toBe('USD')
    expect(result.isActive).toBe(true)
  })

  it('maps phone, mobile, and fax as telephones', () => {
    const result = transformClient(makeRaw())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.find((t) => t.type === 'WORK')?.telephone).toBe('+15551234567')
    expect(result.telephones!.find((t) => t.type === 'MOBILE')?.telephone).toBe('+15559876543')
    expect(result.telephones!.find((t) => t.type === 'FAX')?.telephone).toBe('+15554444444')
  })

  it('maps billing address fields', () => {
    const result = transformClient(makeRaw())
    expect(result.billingAddress?.address1).toBe('100 Main Street')
    expect(result.billingAddress?.address2).toBe('Suite 5')
    expect(result.billingAddress?.city).toBe('Austin')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformClient(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformClient(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
