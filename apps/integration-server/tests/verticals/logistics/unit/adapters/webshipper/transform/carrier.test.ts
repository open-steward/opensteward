import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type WebshipperCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeRaw(overrides: Partial<WebshipperCarrier> = {}): WebshipperCarrier {
  return {
    id: 42,
    type: 'carrier_types',
    attributes: {
      alias: 'DHL Express',
      services: [
        { service_code: 'express', service_name: 'DHL Express' },
        { service_code: 'economy', service_name: 'DHL Economy' },
      ],
      test_mode: false,
      logo_url: 'https://webshipper.example/logos/dhl.png',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T12:00:00Z',
    },
    ...overrides,
  }
}

describe('transformCarrier (webshipper)', () => {
  it('maps id to string from raw.id', () => {
    expect(transformCarrier(makeRaw()).id).toBe('42')
  })

  it('maps code to string from raw.id', () => {
    expect(transformCarrier(makeRaw()).code).toBe('42')
  })

  it('maps name from attributes.alias', () => {
    expect(transformCarrier(makeRaw()).name).toBe('DHL Express')
  })

  it('maps services from attributes.services', () => {
    const result = transformCarrier(makeRaw())
    expect(result.services).toHaveLength(2)
    expect(result.services?.[0]?.code).toBe('express')
    expect(result.services?.[0]?.name).toBe('DHL Express')
  })

  it('filters out services without a service_code', () => {
    const raw = makeRaw({
      attributes: {
        ...makeRaw().attributes,
        services: [
          { service_code: 'express', service_name: 'DHL Express' },
          { service_code: null, service_name: 'No Code Service' },
        ],
      },
    })
    const result = transformCarrier(raw)
    expect(result.services).toHaveLength(1)
  })

  it('sets services undefined when no valid service codes', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, services: [] } })
    expect(transformCarrier(raw).services).toBeUndefined()
  })

  it('sets isActive true when test_mode is false', () => {
    expect(transformCarrier(makeRaw()).isActive).toBe(true)
  })

  it('sets isActive false when test_mode is true', () => {
    const raw = makeRaw({
      attributes: { ...makeRaw().attributes, test_mode: true },
    })
    expect(transformCarrier(raw).isActive).toBe(false)
  })

  it('maps createdAt from attributes.created_at', () => {
    expect(transformCarrier(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from attributes.updated_at', () => {
    expect(transformCarrier(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('handles absent attributes gracefully', () => {
    const result = transformCarrier({ id: '1', type: 'carrier_types', attributes: null })
    expect(result.id).toBe('1')
    expect(result.services).toBeUndefined()
    expect(result.isActive).toBe(true) // !(false) = true
  })

  it('produces output that parses against CarrierSchema', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeRaw()))).not.toThrow()
  })
})
