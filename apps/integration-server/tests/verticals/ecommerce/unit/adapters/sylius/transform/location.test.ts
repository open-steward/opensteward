import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSyliusChannel,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeChannel(overrides: Partial<RawSyliusChannel> = {}): RawSyliusChannel {
  return {
    id: 1,
    code: 'DEFAULT',
    name: 'Default Channel',
    enabled: true,
    hostname: 'shop.example.com',
    description: 'Main sales channel',
    contactEmail: 'shop@example.com',
    contactPhoneNumber: '+1-555-0100',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeChannel())
    expect(result.id).toBe('DEFAULT')
    expect(result.name).toBe('Default Channel')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1-555-0100')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('uses code as name when name is missing', () => {
    const result = transformLocation(makeChannel({ name: undefined }))
    expect(result.name).toBe('DEFAULT')
  })

  it('maps inactive channel', () => {
    const result = transformLocation(makeChannel({ enabled: false }))
    expect(result.active).toBe(false)
  })

  it('handles missing phone', () => {
    const result = transformLocation(makeChannel({ contactPhoneNumber: null }))
    expect(result.phone).toBeUndefined()
  })

  it('preserves metadata', () => {
    const raw = makeChannel()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies LocationSchema', () => {
    const result = transformLocation(makeChannel())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
