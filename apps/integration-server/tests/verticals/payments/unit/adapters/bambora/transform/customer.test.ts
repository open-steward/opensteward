import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawBamboraProfile,
} from '../../../../../../../src/verticals/payments/adapters/bambora/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('bambora transformCustomer', () => {
  it('maps a full profile to a canonical Customer', () => {
    const raw: RawBamboraProfile = {
      customer_code: 'prof-001',
      status: 'A',
      modified_date: '2024-03-01T00:00:00',
      language: 'en',
      comments: 'VIP customer',
      billing: {
        name: 'Jane Doe',
        email_address: 'jane@example.com',
        phone_number: '+15551234567',
        address_line1: '123 Main St',
        address_line2: 'Suite 4',
        city: 'Vancouver',
        province: 'BC',
        country: 'CA',
        postal_code: 'V6B 1A1',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('prof-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+15551234567')
    expect(result.gateway).toBe('bambora')
    expect(result.billingAddress?.city).toBe('Vancouver')
    expect(result.billingAddress?.country).toBe('CA')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles a profile with no billing address', () => {
    const raw: RawBamboraProfile = {
      customer_code: 'prof-002',
      status: 'A',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('prof-002')
    expect(result.billingAddress).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.gateway).toBe('bambora')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps comments to description', () => {
    const raw: RawBamboraProfile = {
      customer_code: 'prof-003',
      comments: 'Test account',
      billing: {
        email_address: 'test@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.description).toBe('Test account')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('sets updatedAt from modified_date', () => {
    const raw: RawBamboraProfile = {
      customer_code: 'prof-004',
      modified_date: '2024-03-01T00:00:00',
    }
    const result = transformCustomer(raw)
    expect(result.updatedAt).toBeTruthy()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
