import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawAsaasCustomer,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('asaas transformCustomer', () => {
  it('maps a full customer object with address', () => {
    const raw: RawAsaasCustomer = {
      id: 'cus_001',
      dateCreated: '2024-03-01T00:00:00Z',
      name: 'João Silva',
      email: 'joao@example.com',
      mobilePhone: '+55-11-91234-5678',
      cpfCnpj: '123.456.789-09',
      address: 'Rua das Flores',
      addressNumber: '100',
      cityName: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
      country: 'BR',
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('cus_001')
    expect(result.name).toBe('João Silva')
    expect(result.email).toBe('joao@example.com')
    expect(result.phone).toBe('+55-11-91234-5678')
    expect(result.billingAddress?.city).toBe('São Paulo')
    expect(result.billingAddress?.region).toBe('SP')
    expect(result.billingAddress?.country).toBe('BR')
    expect(result.billingAddress?.postalCode).toBe('01310-100')
    expect(result.gateway).toBe('asaas')
    expect(result.metadata?.cpfCnpj).toBe('123.456.789-09')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to phone field when mobilePhone is absent', () => {
    const raw: RawAsaasCustomer = {
      id: 'cus_002',
      name: 'Maria Costa',
      phone: '+55-21-3456-7890',
    }
    const result = transformCustomer(raw)

    expect(result.phone).toBe('+55-21-3456-7890')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawAsaasCustomer = { id: 'cus_003' }
    const result = transformCustomer(raw)

    expect(result.id).toBe('cus_003')
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('asaas untransformCustomer', () => {
  it('round-trips name, email, phone, and cpfCnpj', () => {
    const body = untransformCustomer({
      name: 'Ana Lima',
      email: 'ana@example.com',
      phone: '+55-11-99999-9999',
      metadata: { cpfCnpj: '987.654.321-00' },
    })

    expect(body.name).toBe('Ana Lima')
    expect(body.email).toBe('ana@example.com')
    expect(body.mobilePhone).toBe('+55-11-99999-9999')
    expect(body.cpfCnpj).toBe('987.654.321-00')
  })
})
