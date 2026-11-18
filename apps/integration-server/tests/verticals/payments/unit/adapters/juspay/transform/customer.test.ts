import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawJuspayCustomer,
} from '../../../../../../../src/verticals/payments/adapters/juspay/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('juspay transformCustomer', () => {
  it('maps object_reference_id, joined name, email and phone with country code', () => {
    const raw: RawJuspayCustomer = {
      id: 'cust-id-001',
      object_reference_id: 'cust-ref-001',
      first_name: 'Raj',
      last_name: 'Kumar',
      email_address: 'raj@example.com',
      mobile_number: '9876543210',
      mobile_country_code: '91',
      date_created: '2024-03-01T00:00:00Z',
      last_updated: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-ref-001')
    expect(result.externalId).toBe('cust-id-001')
    expect(result.name).toBe('Raj Kumar')
    expect(result.email).toBe('raj@example.com')
    expect(result.phone).toBe('+919876543210')
    expect(result.gateway).toBe('juspay')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits country code prefix when mobile_country_code is absent', () => {
    const raw: RawJuspayCustomer = {
      id: 'cust-id-002',
      object_reference_id: 'cust-ref-002',
      mobile_number: '9876543210',
    }
    const result = transformCustomer(raw)
    expect(result.phone).toBe('9876543210')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles null name fields gracefully', () => {
    const raw: RawJuspayCustomer = {
      id: 'cust-id-003',
      object_reference_id: 'cust-ref-003',
      first_name: null,
      last_name: null,
      email_address: 'anon@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(result.email).toBe('anon@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
