import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawCLCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawCLCustomer> = {}): RawCLCustomer {
  return {
    id: 'cust-001',
    email: 'jane@example.com',
    status: 'prospect',
    has_password: true,
    total_orders_count: 5,
    created_at: '2024-02-01T10:00:00.000Z',
    updated_at: '2024-06-15T12:00:00.000Z',
    _type: 'customers',
    ...overrides,
  }
}

describe('transformCustomer (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.ordersCount).toBe(5)
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-02-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('handles missing email', () => {
    const result = transformCustomer(makeCustomer({ email: undefined }))
    expect(result.email).toBeUndefined()
  })

  it('handles missing orders count', () => {
    const result = transformCustomer(makeCustomer({ total_orders_count: undefined }))
    expect(result.ordersCount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Commerce Layer)', () => {
  it('produces JSON:API body', () => {
    const body = untransformCustomer({
      email: 'new@example.com',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('customers')
    expect(body.data.attributes['email']).toBe('new@example.com')
  })
})
