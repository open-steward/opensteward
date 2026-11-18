import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type TerminalAfricaCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<TerminalAfricaCarrier> = {}): TerminalAfricaCarrier {
  return {
    carrier_id: 'dhl-ng',
    slug: 'dhl',
    name: 'DHL Nigeria',
    logo: 'https://cdn.example.com/dhl.png',
    active: true,
    domestic: false,
    international: true,
    available_countries: ['NG', 'GH'],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('terminal-africa transformCarrier', () => {
  it('prefers carrier_id over slug for id', () => {
    const r = transformCarrier(makeCarrier())
    expect(r.id).toBe('dhl-ng')
  })

  it('falls back to slug when carrier_id is absent', () => {
    const r = transformCarrier(makeCarrier({ carrier_id: null }))
    expect(r.id).toBe('dhl')
  })

  it('maps slug → code', () => {
    const r = transformCarrier(makeCarrier())
    expect(r.code).toBe('dhl')
  })

  it('maps name', () => {
    const r = transformCarrier(makeCarrier())
    expect(r.name).toBe('DHL Nigeria')
  })

  it('maps active → isActive', () => {
    const r = transformCarrier(makeCarrier())
    expect(r.isActive).toBe(true)
  })

  it('maps created_at → createdAt as Date', () => {
    const r = transformCarrier(makeCarrier())
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.createdAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updated_at → updatedAt as Date', () => {
    const r = transformCarrier(makeCarrier())
    expect(r.updatedAt).toBeInstanceOf(Date)
  })

  it('metadata references the raw object', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('passes CarrierSchema validation', () => {
    const result = transformCarrier(makeCarrier())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })

  it('handles null timestamps gracefully', () => {
    const r = transformCarrier(makeCarrier({ created_at: null, updated_at: null }))
    expect(r.createdAt).toBeUndefined()
    expect(r.updatedAt).toBeUndefined()
    expect(() => CarrierSchema.parse(r)).not.toThrow()
  })
})
