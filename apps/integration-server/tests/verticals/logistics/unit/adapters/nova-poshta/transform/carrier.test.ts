import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type NovaPoshtaCarrierRaw,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('nova-poshta transformCarrier', () => {
  it('uses default id "nova-poshta" when raw id is absent', () => {
    expect(transformCarrier({}).id).toBe('nova-poshta')
  })

  it('uses raw id when provided', () => {
    expect(transformCarrier({ id: 'custom-id' }).id).toBe('custom-id')
  })

  it('defaults name to "Nova Poshta"', () => {
    expect(transformCarrier({}).name).toBe('Nova Poshta')
  })

  it('uses raw name when provided', () => {
    expect(transformCarrier({ name: 'NovaPoshta UA' }).name).toBe('NovaPoshta UA')
  })

  it('defaults code to "nova-poshta"', () => {
    expect(transformCarrier({}).code).toBe('nova-poshta')
  })

  it('uses raw code when provided', () => {
    expect(transformCarrier({ code: 'NP' }).code).toBe('NP')
  })

  it('defaults trackingUrlTemplate to Nova Poshta tracking URL', () => {
    expect(transformCarrier({}).trackingUrlTemplate).toContain('novaposhta.ua')
  })

  it('uses raw trackingUrlTemplate when provided', () => {
    const url = 'https://custom.tracking/{trackingNumber}'
    expect(transformCarrier({ trackingUrlTemplate: url }).trackingUrlTemplate).toBe(url)
  })

  it('provides at least one service', () => {
    expect(transformCarrier({}).services!.length).toBeGreaterThan(0)
  })

  it('includes "standard" service code', () => {
    const codes = transformCarrier({}).services!.map((s) => s.code)
    expect(codes).toContain('standard')
  })

  it('defaults isActive to true', () => {
    expect(transformCarrier({}).isActive).toBe(true)
  })

  it('uses raw isActive when provided', () => {
    expect(transformCarrier({ isActive: false }).isActive).toBe(false)
  })

  it('maps createdAt as Date when provided', () => {
    expect(transformCarrier({ createdAt: '2024-03-01T00:00:00Z' }).createdAt).toBeInstanceOf(Date)
  })

  it('passes CarrierSchema.parse without throwing with minimal raw input', () => {
    expect(() => CarrierSchema.parse(transformCarrier({}))).not.toThrow()
  })

  it('passes CarrierSchema.parse without throwing with full raw input', () => {
    const raw: NovaPoshtaCarrierRaw = {
      id: 'nova-poshta',
      name: 'Nova Poshta',
      code: 'NP',
      trackingUrlTemplate: 'https://novaposhta.ua/tracking/?cargo_number={trackingNumber}',
      isActive: true,
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-02T00:00:00Z',
    }
    expect(() => CarrierSchema.parse(transformCarrier(raw))).not.toThrow()
  })
})
