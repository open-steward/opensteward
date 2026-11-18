import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type FrenetOrder,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<FrenetOrder> = {}): FrenetOrder {
  return {
    OrderId: 'ord-001',
    OrderNumber: 'ORD-1042',
    PlatformOrderId: 'PLAT-9999',
    ShipmentIds: ['shp-001', 'shp-002'],
    Status: 'em transito',
    Carrier: 'Correios',
    CarrierCode: '04014',
    TrackingNumber: 'BR123456789BR',
    ServiceDescription: 'SEDEX',
    Weight: '2.5',
    InvoiceValue: 500,
    ShippingPrice: '25.00',
    OriginAddress: {
      Addressee: 'Alice Sender',
      Street: 'Av. Paulista',
      Number: '1000',
      City: 'São Paulo',
      UF: 'SP',
      CEP: '01311-000',
      Country: 'BR',
    },
    DestinationAddress: {
      Addressee: 'Bob Recipient',
      Street: 'Rua das Flores',
      Number: '50',
      City: 'Rio de Janeiro',
      UF: 'RJ',
      CEP: '20040-020',
      Country: 'BR',
    },
    CreatedDate: '2024-03-01T00:00:00Z',
    UpdatedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('frenet transformOrder', () => {
  it('maps OrderId as id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-001')
  })

  it('maps OrderNumber as orderNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ORD-1042')
  })

  it('falls back orderNumber to PlatformOrderId when OrderNumber is null', () => {
    expect(transformOrder(makeOrder({ OrderNumber: null })).orderNumber).toBe('PLAT-9999')
  })

  it('maps ShipmentIds array', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['shp-001', 'shp-002'])
  })

  it('maps ShippingPrice as totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(25)
  })

  it('sets currency BRL when ShippingPrice is present', () => {
    expect(transformOrder(makeOrder()).currency).toBe('BRL')
  })

  it('omits totalAmount and currency when ShippingPrice is null', () => {
    const result = transformOrder(makeOrder({ ShippingPrice: null }))
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('maps origin address name', () => {
    expect(transformOrder(makeOrder()).originAddress?.name).toBe('Alice Sender')
  })

  it('maps destination address name', () => {
    expect(transformOrder(makeOrder()).destinationAddress?.name).toBe('Bob Recipient')
  })

  it('maps createdAt as Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('emits empty shipmentIds when ShipmentIds is null', () => {
    // nonempty([]) returns undefined when the array is empty
    expect(transformOrder(makeOrder({ ShipmentIds: null })).shipmentIds).toBeUndefined()
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
