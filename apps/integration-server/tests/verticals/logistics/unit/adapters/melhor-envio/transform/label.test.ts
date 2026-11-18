import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type MelhorEnvioLabel,
} from '../../../../../../../src/verticals/logistics/adapters/melhor-envio/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<MelhorEnvioLabel> = {}): MelhorEnvioLabel {
  return {
    id: 'lbl-42',
    protocol: 'PROTO-001',
    cart_id: 'cart-99',
    tracking: 'BR123456789BR',
    status: 'released',
    service_id: 7,
    service_code: 'pac',
    company: { id: 1, name: 'Correios' },
    url: 'https://melhorenvio.com.br/labels/lbl-42.pdf',
    format: 'pdf',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    generated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (melhor-envio)', () => {
  it('maps id as string from raw id', () => {
    expect(transformLabel(makeLabel()).id).toBe('lbl-42')
  })

  it('maps shipmentId from cart_id', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('cart-99')
  })

  it('maps trackingNumber from tracking field', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('BR123456789BR')
  })

  it('derives carrierId from company name (lowercased, kebab)', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('correios')
  })

  it('defaults carrierId to "melhor-envio" when company is absent', () => {
    expect(transformLabel(makeLabel({ company: null })).carrierId).toBe('melhor-envio')
  })

  it('maps serviceCode from service_code field', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('pac')
  })

  it('maps format PDF from "pdf" string', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps format ZPL from "ZPL" string', () => {
    expect(transformLabel(makeLabel({ format: 'ZPL' })).format).toBe('ZPL')
  })

  it('maps status to "CREATED"', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps url', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://melhorenvio.com.br/labels/lbl-42.pdf')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces a LabelSchema-valid result', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })
})
