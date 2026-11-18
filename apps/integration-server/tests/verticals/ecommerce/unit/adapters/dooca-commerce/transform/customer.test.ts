import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawDoocaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawDoocaCustomer> = {}): RawDoocaCustomer {
  return {
    id: 101,
    email: 'joao@example.com.br',
    name: 'João Silva',
    phone: '+55-11-99999-8888',
    active: true,
    orders_count: 3,
    address: {
      receiver: 'João Silva',
      zipcode: '01310-100',
      street: 'Avenida Paulista',
      number: '1000',
      detail: 'Apto 42',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformCustomer(makeCustomer({ id: 101 }))
    expect(result.id).toBe('101')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('joao@example.com.br')
  })

  it('splits name into firstName and lastName', () => {
    const result = transformCustomer(makeCustomer({ name: 'João Silva' }))
    expect(result.firstName).toBe('João')
    expect(result.lastName).toBe('Silva')
  })

  it('prefers explicit first_name / last_name over full name', () => {
    const result = transformCustomer(
      makeCustomer({ name: 'João Silva', first_name: 'João', last_name: 'da Silva' }),
    )
    expect(result.firstName).toBe('João')
    expect(result.lastName).toBe('da Silva')
  })

  it('maps single-word name to firstName only', () => {
    const result = transformCustomer(makeCustomer({ name: 'Pep' }))
    expect(result.firstName).toBe('Pep')
    expect(result.lastName).toBeUndefined()
  })

  it('maps phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+55-11-99999-8888')
  })

  it('maps orders_count', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('maps address: combines street and number into line1', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.line1).toBe('Avenida Paulista, 1000')
    expect(result.defaultAddress!.city).toBe('São Paulo')
    expect(result.defaultAddress!.postalCode).toBe('01310-100')
    expect(result.defaultAddress!.country).toBe('BR')
  })

  it('maps address detail to line2', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress!.line2).toBe('Apto 42')
  })

  it('places address into addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
  })

  it('returns no address when address is null', () => {
    const result = transformCustomer(makeCustomer({ address: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Dooca Commerce)', () => {
  it('maps firstName and lastName to first_name / last_name', () => {
    const body = untransformCustomer({ firstName: 'João', lastName: 'Silva' })
    expect(body['first_name']).toBe('João')
    expect(body['last_name']).toBe('Silva')
  })

  it('constructs combined name when first/last present', () => {
    const body = untransformCustomer({ firstName: 'João', lastName: 'Silva' })
    expect(body['name']).toBe('João Silva')
  })

  it('maps email', () => {
    const body = untransformCustomer({ email: 'test@example.com' })
    expect(body['email']).toBe('test@example.com')
  })

  it('maps defaultAddress to address object with separate street/number', () => {
    const body = untransformCustomer({
      defaultAddress: {
        line1: 'Rua X, 10',
        city: 'SP',
        postalCode: '01000-000',
      },
    })
    const addr = body['address'] as Record<string, unknown>
    expect(addr['street']).toBe('Rua X')
    expect(addr['number']).toBe('10')
    expect(addr['city']).toBe('SP')
    expect(addr['zipcode']).toBe('01000-000')
  })
})
