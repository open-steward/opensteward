import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type EnviaYaLabel,
} from '../../../../../../../src/verticals/logistics/adapters/enviaya/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLabel(overrides: Partial<EnviaYaLabel> = {}): EnviaYaLabel {
  return {
    enviaya_shipment_number: 'EY-2024-001',
    carrier_shipment_number: 'TRK-CARRIER-001',
    carrier: 'dhl',
    carrier_service_code: 'DHL_EXPRESS',
    label_url: 'https://cdn.enviaya.com/labels/EY-2024-001.pdf',
    file_format: 'PDF',
    total_amount: 320.5,
    currency: 'MXN',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps id and shipmentId from enviaya_shipment_number', () => {
    const result = transformLabel(makeLabel())
    // raw.enviaya_shipment_number → id AND shipmentId — verified in source
    expect(result.id).toBe('EY-2024-001')
    expect(result.shipmentId).toBe('EY-2024-001')
  })

  it('maps trackingNumber from carrier_shipment_number', () => {
    // raw.carrier_shipment_number → trackingNumber — verified in source
    expect(transformLabel(makeLabel()).trackingNumber).toBe('TRK-CARRIER-001')
  })

  it('maps carrierId and serviceCode', () => {
    const result = transformLabel(makeLabel())
    expect(result.carrierId).toBe('dhl')
    expect(result.serviceCode).toBe('DHL_EXPRESS')
  })

  it('maps url from label_url', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://cdn.enviaya.com/labels/EY-2024-001.pdf')
  })

  it('status is always CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps PDF format', () => {
    expect(transformLabel(makeLabel({ file_format: 'PDF' })).format).toBe('PDF')
  })

  it('maps ZPL format', () => {
    expect(transformLabel(makeLabel({ file_format: 'ZPL' })).format).toBe('ZPL')
  })

  it('maps EPL2 format', () => {
    expect(transformLabel(makeLabel({ file_format: 'EPL2' })).format).toBe('EPL2')
  })

  it('maps cost amount and defaults currency to MXN', () => {
    const result = transformLabel(makeLabel({ currency: null }))
    // currency ?? 'MXN' — verified in source
    expect(result.cost?.currency).toBe('MXN')
    // 320.5 MXN → 32050 minor units (centavos)
    expect(result.cost?.amount).toBe(32050)
  })

  it('omits cost when total_amount is null', () => {
    expect(transformLabel(makeLabel({ total_amount: null })).cost).toBeUndefined()
  })

  it('maps createdAt and updatedAt to Date', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('LabelSchema.parse passes when cost.amount is converted to integer minor-units', () => {
    // transformLabel converts decimal amounts (e.g. 320.5 MXN) to integer
    // minor units (32050 centavos). The shared Amount schema requires z.number().int().
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
