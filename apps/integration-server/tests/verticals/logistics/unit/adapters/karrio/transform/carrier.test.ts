/**
 * Karrio carriers are the account's carrier connections, GET /v1/connections.
 * The fixture is the documented "List carrier connections" 200 response item
 * (https://docs.karrio.io/reference/openapi), with its placeholder strings
 * replaced by plausible values of the documented types.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type KarrioCarrierConnection,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeRaw(overrides: Partial<KarrioCarrierConnection> = {}): KarrioCarrierConnection {
  return {
    id: 'car_7f3b2c',
    object_type: 'carrier-connection',
    carrier_name: 'allied_express',
    display_name: 'Allied Express',
    carrier_id: 'allied-main',
    credentials: { api_key: 'secret-carrier-key' },
    capabilities: ['shipping', 'tracking'],
    config: {},
    metadata: {},
    is_system: true,
    active: true,
    test_mode: true,
    ...overrides,
  }
}

describe('karrio transformCarrier (carrier connection)', () => {
  it('parses with CarrierSchema', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeRaw()))).not.toThrow()
  })

  it('id is carrier_id, the key shipments, labels, manifests and rates carry', () => {
    const c = CarrierSchema.parse(transformCarrier(makeRaw()))
    expect(c.id).toBe('allied-main')
    expect(c.code).toBe('allied_express')
    expect(c.name).toBe('Allied Express')
  })

  it('isActive follows active', () => {
    expect(CarrierSchema.parse(transformCarrier(makeRaw({ active: false }))).isActive).toBe(false)
  })

  it('keeps the connection id, capabilities and flags in metadata', () => {
    expect(CarrierSchema.parse(transformCarrier(makeRaw())).metadata).toEqual({
      connectionId: 'car_7f3b2c',
      capabilities: ['shipping', 'tracking'],
      isSystem: true,
      testMode: true,
    })
  })

  it('never copies the carrier account credentials', () => {
    const out = JSON.stringify(transformCarrier(makeRaw()))
    expect(out).not.toContain('secret-carrier-key')
    expect(out).not.toContain('credentials')
  })

  it('name is omitted when display_name is absent, never replaced by another field', () => {
    const c = CarrierSchema.parse(transformCarrier(makeRaw({ display_name: undefined })))
    expect(c.name).toBeUndefined()
  })

  it('invents no services: a connection lists none', () => {
    expect(CarrierSchema.parse(transformCarrier(makeRaw())).services).toBeUndefined()
  })
})
