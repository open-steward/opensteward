import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawEwayCustomer,
} from '../../../../../../../src/verticals/payments/adapters/eway/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('eway transformCustomer', () => {
  it('maps a full customer record with address', () => {
    const raw: RawEwayCustomer = {
      TokenCustomerID: 987654321,
      Reference: 'CUST-001',
      Title: 'Mr',
      FirstName: 'John',
      LastName: 'Smith',
      CompanyName: 'Acme Corp',
      Email: 'john.smith@acme.example',
      Phone: '+61299999999',
      Mobile: '+61400000000',
      Street1: '42 Example Street',
      Street2: 'Unit 1',
      City: 'Sydney',
      State: 'NSW',
      PostalCode: '2000',
      Country: 'au',
      CardDetails: {
        CardType: 'VISA',
        Number: '411111XXXXXX1111',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('987654321')
    expect(result.email).toBe('john.smith@acme.example')
    expect(result.name).toBe('John Smith')
    expect(result.gateway).toBe('eway')
    // eWAY returns country in lowercase; transform uppercases it
    expect(result.billingAddress?.country).toBe('AU')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer record (no address)', () => {
    const raw: RawEwayCustomer = {
      TokenCustomerID: 111111,
      Email: 'minimal@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('111111')
    expect(result.email).toBe('minimal@example.com')
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to Reference when TokenCustomerID is absent', () => {
    const raw: RawEwayCustomer = {
      Reference: 'REF-ONLY',
      FirstName: 'Jane',
      LastName: 'Doe',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('REF-ONLY')
    expect(result.name).toBe('Jane Doe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
