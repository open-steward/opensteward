import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawGr4vyBuyer,
} from '../../../../../../../src/verticals/payments/adapters/gr4vy/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('gr4vy transformCustomer', () => {
  it('maps a buyer with display_name and billing_details', () => {
    const raw: RawGr4vyBuyer = {
      id: 'buyer-001',
      external_identifier: 'ext-buyer-001',
      display_name: 'Jane Doe',
      billing_details: {
        first_name: 'Jane',
        last_name: 'Doe',
        email_address: 'jane@example.com',
        phone_number: '+14155550123',
      },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('buyer-001')
    expect(result.externalId).toBe('ext-buyer-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('gr4vy')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('composes name from first_name + last_name when display_name is absent', () => {
    const raw: RawGr4vyBuyer = {
      id: 'buyer-002',
      billing_details: {
        first_name: 'Bob',
        last_name: 'Smith',
        email_address: 'bob@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Bob Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal buyer (id only)', () => {
    const raw: RawGr4vyBuyer = {
      id: 'buyer-003',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('buyer-003')
    expect(result.externalId).toBe('buyer-003')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips email and name through untransformCustomer', () => {
    const raw: RawGr4vyBuyer = {
      id: 'buyer-004',
      external_identifier: 'ext-004',
      display_name: 'Alice Wonder',
      billing_details: {
        email_address: 'alice@example.com',
        phone_number: '+442071234567',
      },
    }
    const canonical = transformCustomer(raw)
    const wire = untransformCustomer(canonical)
    expect(wire.display_name).toBe('Alice Wonder')
    expect((wire.billing_details as Record<string, unknown>)?.email_address).toBe(
      'alice@example.com',
    )
    expect(() => CustomerSchema.parse(canonical)).not.toThrow()
  })
})
