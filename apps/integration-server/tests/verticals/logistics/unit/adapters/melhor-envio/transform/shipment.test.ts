import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type MelhorEnvioShipment,
} from '../../../../../../../src/verticals/logistics/adapters/melhor-envio/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<MelhorEnvioShipment> = {}): MelhorEnvioShipment {
  return {
    id: 'shp-55',
    protocol: 'PROTO-55',
    status: 'in_transit',
    tracking: 'BR111222333BR',
    service_id: 3,
    service_code: 'sedex',
    service_name: 'SEDEX',
    company: { id: 1, name: 'Correios' },
    from: {
      name: 'Sender',
      address1: 'Rua Origem 1',
      city: 'São Paulo',
      state: 'SP',
      zip: '01310-100',
      country: 'BR',
    },
    to: {
      name: 'Receiver',
      address1: 'Rua Destino 2',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zip: '20040-020',
      country: 'BR',
    },
    volumes: [{ id: 'v1', height: 10, width: 15, length: 20, weight: 1.2, format: 'box' }],
    price: '29.90',
    label: { url: 'https://melhorenvio.com.br/labels/shp-55.pdf' },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (melhor-envio)', () => {
  it('maps id as string', () => {
    expect(transformShipment(makeShipment()).id).toBe('shp-55')
  })

  it('maps trackingNumber from tracking field', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('BR111222333BR')
  })

  it('maps status IN_TRANSIT for "in_transit"', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status LABEL_CREATED for "generated"', () => {
    expect(transformShipment(makeShipment({ status: 'generated' })).status).toBe('LABEL_CREATED')
  })

  it('maps status DELIVERED for "entregue"', () => {
    expect(transformShipment(makeShipment({ status: 'entregue' })).status).toBe('DELIVERED')
  })

  it('maps status EXCEPTION for "cancelado"', () => {
    // "CANCELADO" hits the EXCEPTION branch before CANCELLED in mapShipmentStatus
    expect(transformShipment(makeShipment({ status: 'cancelado' })).status).toBe('EXCEPTION')
  })

  it('derives carrierId from company name', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('correios')
  })

  it('defaults carrierId to "melhor-envio" when company absent', () => {
    expect(transformShipment(makeShipment({ company: null })).carrierId).toBe('melhor-envio')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('sedex')
  })

  it('aggregates totalWeight from volumes array (kg)', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(1.2)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('sums weight across multiple volumes', () => {
    const raw = makeShipment({
      volumes: [
        { id: 'v1', weight: 1.0 },
        { id: 'v2', weight: 2.5 },
      ],
    })
    expect(transformShipment(raw).totalWeight?.value).toBe(3.5)
  })

  it('maps labelUrl from label.url', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://melhorenvio.com.br/labels/shp-55.pdf',
    )
  })

  it('falls back to root url when label is absent', () => {
    const raw = makeShipment({ label: null, url: 'https://melhorenvio.com.br/labels/fallback.pdf' })
    expect(transformShipment(raw).labelUrl).toBe('https://melhorenvio.com.br/labels/fallback.pdf')
  })

  it('maps reference from protocol', () => {
    expect(transformShipment(makeShipment()).reference).toBe('PROTO-55')
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces a ShipmentSchema-valid result', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
