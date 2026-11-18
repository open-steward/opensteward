import { describe, it, expect } from 'vitest'
import {
  transformClient,
  untransformClient,
  type RawInsalesClient,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeClient(overrides: Partial<RawInsalesClient> = {}): RawInsalesClient {
  return {
    id: 7001,
    name: 'Анна',
    surname: 'Иванова',
    email: 'anna@example.com',
    phone: '+79161234567',
    orders_count: 5,
    total_price: '3500.00',
    subscribe: true,
    default_address: {
      address: 'ул. Ленина, д. 1',
      city: 'Москва',
      country: 'RU',
      zip: '101000',
      state: 'Москва',
    },
    addresses: [
      {
        address: 'ул. Ленина, д. 1',
        city: 'Москва',
        country: 'RU',
        zip: '101000',
        state: 'Москва',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformClient (insales)', () => {
  it('maps id as string', () => {
    const result = transformClient(makeClient())
    expect(result.id).toBe('7001')
  })

  it('maps email, firstName (name), lastName (surname), phone', () => {
    const result = transformClient(makeClient())
    expect(result.email).toBe('anna@example.com')
    expect(result.firstName).toBe('Анна')
    expect(result.lastName).toBe('Иванова')
    expect(result.phone).toBe('+79161234567')
  })

  it('maps acceptsMarketing from subscribe', () => {
    const result = transformClient(makeClient())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps ordersCount', () => {
    const result = transformClient(makeClient())
    expect(result.ordersCount).toBe(5)
  })

  it('maps totalSpent in minor units (RUB)', () => {
    const result = transformClient(makeClient())
    // 3500.00 RUB → 350000 minor units
    expect(result.totalSpent).toEqual({ amount: 350000, currency: 'RUB' })
  })

  it('omits totalSpent when total_price is null', () => {
    const result = transformClient(makeClient({ total_price: null }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('handles total_price as number', () => {
    const result = transformClient(makeClient({ total_price: 1200 }))
    expect(result.totalSpent).toEqual({ amount: 120000, currency: 'RUB' })
  })

  it('maps defaultAddress from default_address', () => {
    const result = transformClient(makeClient())
    expect(result.defaultAddress?.line1).toBe('ул. Ленина, д. 1')
    expect(result.defaultAddress?.city).toBe('Москва')
    expect(result.defaultAddress?.postalCode).toBe('101000')
    expect(result.defaultAddress?.country).toBe('RU')
  })

  it('maps addresses array', () => {
    const result = transformClient(makeClient())
    expect(result.addresses).toHaveLength(1)
  })

  it('omits defaultAddress when null', () => {
    const result = transformClient(makeClient({ default_address: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformClient(makeClient())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeClient()
    const result = transformClient(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformClient', () => {
    const canonical = transformClient(makeClient())
    const body = untransformClient(canonical)
    expect(body['name']).toBe('Анна')
    expect(body['surname']).toBe('Иванова')
    expect(body['email']).toBe('anna@example.com')
    expect(body['subscribe']).toBe(true)
  })

  it('uses delivery_address when address is null', () => {
    const result = transformClient(
      makeClient({
        default_address: {
          delivery_address: 'пр. Мира 5',
          city: 'Санкт-Петербург',
          country: 'RU',
        },
      }),
    )
    expect(result.defaultAddress?.line1).toBe('пр. Мира 5')
  })
})
