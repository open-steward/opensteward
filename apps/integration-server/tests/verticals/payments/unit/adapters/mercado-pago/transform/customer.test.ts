import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawMPCustomer,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('mercado-pago transformCustomer', () => {
  const base: RawMPCustomer = {
    id: 'cust-abc-123',
    email: 'customer@example.com',
    first_name: 'Maria',
    last_name: 'Gonzalez',
    phone: { area_code: '011', number: '5555-1234' },
    identification: { type: 'CPF', number: '123.456.789-00' },
    description: 'VIP customer',
    date_created: '2023-06-15T08:00:00.000Z',
    date_last_updated: '2024-01-10T09:00:00.000Z',
  }

  it('maps id and externalId from raw id', () => {
    const result = transformCustomer(base)
    expect(result.id).toBe('cust-abc-123')
    expect(result.externalId).toBe('cust-abc-123')
  })

  it('maps email and concatenated name', () => {
    const result = transformCustomer(base)
    expect(result.email).toBe('customer@example.com')
    expect(result.name).toBe('Maria Gonzalez')
  })

  it('maps phone number', () => {
    const result = transformCustomer(base)
    expect(result.phone).toBe('5555-1234')
  })

  it('puts identification details in metadata', () => {
    const result = transformCustomer(base)
    expect(result.metadata['identification_type']).toBe('CPF')
    expect(result.metadata['identification_number']).toBe('123.456.789-00')
  })

  it('puts area_code in metadata', () => {
    const result = transformCustomer(base)
    expect(result.metadata['area_code']).toBe('011')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformCustomer(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('handles missing first/last name gracefully', () => {
    const result = transformCustomer({ ...base, first_name: undefined, last_name: undefined })
    expect(result.name).toBeUndefined()
  })

  it('conforms to CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(base))).not.toThrow()
  })
})
