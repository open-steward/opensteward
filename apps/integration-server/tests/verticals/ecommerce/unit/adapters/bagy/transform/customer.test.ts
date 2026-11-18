import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawBagyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagy/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawBagyCustomer> = {}): RawBagyCustomer {
  return {
    id: 200,
    name: 'Maria Silva',
    email: 'maria@example.com',
    cellphone: '11999990000',
    newsletter: 1,
    CustomerAddress: [
      {
        address: 'Rua das Flores 100',
        complement: 'Ap 5',
        city: 'São Paulo',
        state: 'SP',
        zip: '01310-100',
        country: 'BR',
      },
    ],
    created: '2024-03-01T00:00:00Z',
    modified: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Bagy)', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeCustomer({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('maria@example.com')
  })

  it('splits full name into first and last', () => {
    const result = transformCustomer(makeCustomer({ name: 'Maria Silva' }))
    expect(result.firstName).toBe('Maria')
    expect(result.lastName).toBe('Silva')
  })

  it('maps cellphone to phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('11999990000')
  })

  it('maps newsletter=1 to acceptsMarketing=true', () => {
    const result = transformCustomer(makeCustomer({ newsletter: 1 }))
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps newsletter=0 to acceptsMarketing=false', () => {
    const result = transformCustomer(makeCustomer({ newsletter: 0 }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps CustomerAddress[0] to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('Rua das Flores 100')
    expect(result.defaultAddress?.city).toBe('São Paulo')
  })

  it('stores raw in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits ordersCount and totalSpent (not in Bagy API)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBeUndefined()
    expect(result.totalSpent).toBeUndefined()
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Bagy)', () => {
  it('concatenates first and last name into name', () => {
    const body = untransformCustomer({ firstName: 'Maria', lastName: 'Silva' })
    expect(body.name).toBe('Maria Silva')
  })

  it('maps email', () => {
    const body = untransformCustomer({ email: 'a@b.com' })
    expect(body.email).toBe('a@b.com')
  })

  it('maps phone to cellphone', () => {
    const body = untransformCustomer({ phone: '11999990000' })
    expect(body.cellphone).toBe('11999990000')
  })

  it('maps acceptsMarketing=true to newsletter=1', () => {
    const body = untransformCustomer({ acceptsMarketing: true })
    expect(body.newsletter).toBe(1)
  })

  it('maps defaultAddress to CustomerAddress array', () => {
    const body = untransformCustomer({
      defaultAddress: { line1: 'Rua A', city: 'SP', country: 'BR' },
    })
    const addrs = body.CustomerAddress as Array<Record<string, unknown>>
    expect(addrs[0]!.address).toBe('Rua A')
  })
})
