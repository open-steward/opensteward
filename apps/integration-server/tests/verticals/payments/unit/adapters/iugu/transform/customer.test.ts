import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawIuguCustomer,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('iugu transformCustomer', () => {
  it('maps a full customer record', () => {
    const raw: RawIuguCustomer = {
      id: 'cust-001',
      email: 'cliente@exemplo.com.br',
      name: 'João Silva',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('cliente@exemplo.com.br')
    expect(result.name).toBe('João Silva')
    expect(result.gateway).toBe('iugu')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const raw: RawIuguCustomer = {
      id: 'cust-002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-002')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses metadata from raw.metadata field', () => {
    const raw: RawIuguCustomer = {
      id: 'cust-003',
      email: 'meta@example.com',
      metadata: { account_type: 'premium' },
    }
    const result = transformCustomer(raw)
    expect(result.metadata).toEqual({ account_type: 'premium' })
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
