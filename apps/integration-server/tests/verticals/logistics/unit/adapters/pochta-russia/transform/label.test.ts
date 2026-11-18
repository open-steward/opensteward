import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type PochtaRussiaLabelMeta,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

describe('transformLabel', () => {
  it('maps id, label-url, and barcode correctly', () => {
    const raw: PochtaRussiaLabelMeta = {
      id: 42,
      barcode: 'RU123456789RU',
      'shipment-id': '99',
      'label-url': 'https://otpravka.pochta.ru/label/42.pdf',
      'created-on': '2024-03-01T00:00:00Z',
    }
    const result = transformLabel(raw, '99', 'RU123456789RU')
    // id comes from raw['id']
    expect(result.id).toBe('42')
    // trackingNumber comes from the explicit argument
    expect(result.trackingNumber).toBe('RU123456789RU')
  })

  it('sets carrierId to pochta-russia and status to CREATED', () => {
    const raw: PochtaRussiaLabelMeta = { id: 1 }
    const result = transformLabel(raw)
    expect(result.carrierId).toBe('pochta-russia')
    expect(result.status).toBe('CREATED')
  })

  it('falls back to form-url when label-url is absent', () => {
    const raw: PochtaRussiaLabelMeta = {
      'form-url': 'https://otpravka.pochta.ru/form/1.pdf',
    }
    const result = transformLabel(raw)
    expect(result.url).toBe('https://otpravka.pochta.ru/form/1.pdf')
  })

  it('falls back id to shipmentId arg when raw.id is null', () => {
    const raw: PochtaRussiaLabelMeta = {}
    const result = transformLabel(raw, 'ship-100')
    expect(result.id).toBe('ship-100')
    expect(result.shipmentId).toBe('ship-100')
  })

  it('passes schema parse', () => {
    const raw: PochtaRussiaLabelMeta = {
      id: 7,
      barcode: 'RU999999999RU',
      'label-url': 'https://otpravka.pochta.ru/label/7.pdf',
      'created-on': '2024-03-01T00:00:00Z',
    }
    const result = transformLabel(raw, '7', 'RU999999999RU')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
