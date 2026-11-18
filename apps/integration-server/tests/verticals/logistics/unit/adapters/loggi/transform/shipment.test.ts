import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type LoggiPackage,
} from '../../../../../../../src/verticals/logistics/adapters/loggi/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<LoggiPackage> = {}): LoggiPackage {
  return {
    loggiKey: 'LK-001',
    trackingCode: 'TRK-001',
    status: 'in_transit',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    deliveredAt: null,
    sender: { name: 'Sender Co', city: 'São Paulo', country: 'BR' },
    recipient: { name: 'Recipient Co', city: 'Rio de Janeiro', country: 'BR' },
    dimensions: { weight: 500, length: 30, width: 20, height: 10 },
    price: { totalAmount: 2500, currency: 'BRL' },
    labelUrl: 'https://labels.loggi.com/LK-001.pdf',
    reference: 'ORD-999',
    serviceType: 'EXPRESS',
    ...overrides,
  }
}

describe('loggi transformShipment', () => {
  it('uses loggiKey as id', () => {
    expect(transformShipment(makeRaw({ loggiKey: 'LK-001' })).id).toBe('LK-001')
  })

  it('falls back to trackingCode when loggiKey is null', () => {
    const result = transformShipment(makeRaw({ loggiKey: null, trackingCode: 'TRK-001' }))
    expect(result.id).toBe('TRK-001')
  })

  it('maps trackingNumber from trackingCode', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRK-001')
  })

  it('sets carrierId to loggi', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('loggi')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status em_transito → IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 'em_transito' })).status).toBe('IN_TRANSIT')
  })

  it('maps status entregue → DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'entregue' })).status).toBe('DELIVERED')
  })

  it('maps status cancelado → CANCELLED', () => {
    expect(transformShipment(makeRaw({ status: 'cancelado' })).status).toBe('CANCELLED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: 'mystery_status' })).status).toBe('UNKNOWN')
  })

  it('maps serviceCode from serviceType', () => {
    expect(transformShipment(makeRaw({ serviceType: 'EXPRESS' })).serviceCode).toBe('EXPRESS')
  })

  it('maps reference', () => {
    expect(transformShipment(makeRaw({ reference: 'ORD-999' })).reference).toBe('ORD-999')
  })

  it('maps labelUrl', () => {
    expect(transformShipment(makeRaw()).labelUrl).toBe('https://labels.loggi.com/LK-001.pdf')
  })

  it('maps cost amount and currency', () => {
    const result = transformShipment(makeRaw({ price: { totalAmount: 2500, currency: 'BRL' } }))
    expect(result.cost?.amount).toBe(2500)
    expect(result.cost?.currency).toBe('BRL')
  })

  it('cost is undefined when price.totalAmount is null', () => {
    expect(
      transformShipment(makeRaw({ price: { totalAmount: null, currency: 'BRL' } })).cost,
    ).toBeUndefined()
  })

  it('maps originAddress city from sender', () => {
    expect(transformShipment(makeRaw()).originAddress?.city).toBe('São Paulo')
  })

  it('maps destinationAddress city from recipient', () => {
    expect(transformShipment(makeRaw()).destinationAddress?.city).toBe('Rio de Janeiro')
  })

  it('maps totalWeight from dimensions.weight in grams', () => {
    const result = transformShipment(makeRaw({ dimensions: { weight: 500 } }))
    expect(result.totalWeight?.value).toBe(500)
    expect(result.totalWeight?.unit).toBe('g')
  })

  it('maps dimensions', () => {
    const result = transformShipment(makeRaw())
    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.width).toBe(20)
    expect(result.dimensions?.height).toBe(10)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('parses createdAt as Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('parses estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
