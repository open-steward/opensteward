import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawHelcimCustomer,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('helcim transformCustomer', () => {
  it('maps a full customer with contact name and billing address', () => {
    const raw: RawHelcimCustomer = {
      id: 9001,
      customerCode: 'CUST-001',
      contactName: 'Jane Doe',
      email: 'jane@example.com',
      cellPhone: '+14155550123',
      billingAddress: {
        street1: '123 Main St',
        city: 'Calgary',
        province: 'AB',
        country: 'CA',
        postalCode: 'T2P1A1',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('CUST-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
    expect(result.billingAddress?.country).toBe('CA')
    expect(result.billingAddress?.region).toBe('AB')
    expect(result.gateway).toBe('helcim')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to businessName when contactName is absent', () => {
    const raw: RawHelcimCustomer = {
      id: 9002,
      customerCode: 'CUST-002',
      businessName: 'Acme Corp',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Acme Corp')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('resolves email from billingAddress when top-level email is absent', () => {
    const raw: RawHelcimCustomer = {
      id: 9003,
      customerCode: 'CUST-003',
      billingAddress: {
        street1: '456 Elm St',
        city: 'Toronto',
        country: 'CA',
        email: 'billing@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.email).toBe('billing@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer with only id', () => {
    const raw: RawHelcimCustomer = {
      id: 9004,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('9004')
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
