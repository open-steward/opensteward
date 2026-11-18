import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type FrenetShipment,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<FrenetShipment> = {}): FrenetShipment {
  return {
    ShipmentId: 'shp-001',
    OrderNumber: 'ORD-001',
    ServiceDescription: 'SEDEX',
    Carrier: 'Correios',
    CarrierCode: '04014',
    TrackingNumber: 'BR123456789BR',
    Status: 'em transito',
    Weight: 1.5,
    Height: 10,
    Width: 20,
    Length: 30,
    InvoiceValue: 200,
    ShippingPrice: '19.50',
    LabelUrl: 'https://labels.frenet.example/shp-001.pdf',
    DestinationAddress: {
      Addressee: 'Bob Recipient',
      Street: 'Rua das Flores',
      Number: '100',
      City: 'São Paulo',
      UF: 'SP',
      CEP: '01310-100',
      Country: 'BR',
    },
    OriginAddress: {
      Addressee: 'Alice Sender',
      Street: 'Av. Paulista',
      Number: '1000',
      City: 'São Paulo',
      UF: 'SP',
      CEP: '01311-000',
      Country: 'BR',
    },
    CreatedDate: '2024-03-01T00:00:00Z',
    UpdatedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('frenet transformShipment', () => {
  it('maps ShipmentId as id', () => {
    expect(transformShipment(makeShipment()).id).toBe('shp-001')
  })

  it('maps TrackingNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('BR123456789BR')
  })

  it('maps Carrier as carrierId', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('Correios')
  })

  it('maps CarrierCode as serviceCode', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('04014')
  })

  it('maps "em transito" status → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps "entregue" status → DELIVERED', () => {
    expect(transformShipment(makeShipment({ Status: 'entregue' })).status).toBe('DELIVERED')
  })

  it('maps "saiu para entrega" status → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeShipment({ Status: 'saiu para entrega' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps "etiqueta" status → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ Status: 'etiqueta gerada' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps "devolvido" status → RETURNED', () => {
    expect(transformShipment(makeShipment({ Status: 'devolvido' })).status).toBe('RETURNED')
  })

  it('maps "cancelado" status → CANCELLED', () => {
    expect(transformShipment(makeShipment({ Status: 'cancelado' })).status).toBe('CANCELLED')
  })

  it('maps "extravio" status → EXCEPTION', () => {
    expect(transformShipment(makeShipment({ Status: 'extravio detectado' })).status).toBe(
      'EXCEPTION',
    )
  })

  it('maps null status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ Status: null })).status).toBe('UNKNOWN')
  })

  it('maps ShippingPrice as cost in BRL (minor units)', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(1950)
    expect(result.cost?.currency).toBe('BRL')
  })

  it('omits cost when ShippingPrice is null', () => {
    expect(transformShipment(makeShipment({ ShippingPrice: null })).cost).toBeUndefined()
  })

  it('maps Weight as kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps dimensions in cm', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.width).toBe(20)
    expect(result.dimensions?.height).toBe(10)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps LabelUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://labels.frenet.example/shp-001.pdf',
    )
  })

  it('maps OrderNumber as reference', () => {
    expect(transformShipment(makeShipment()).reference).toBe('ORD-001')
  })

  it('maps origin and destination address names', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.destinationAddress?.name).toBe('Bob Recipient')
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
