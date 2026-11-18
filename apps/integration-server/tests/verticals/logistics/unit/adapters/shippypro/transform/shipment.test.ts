import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  transformReportShipment,
  transformOrderDetailShipment,
  type ShippyProShipment,
  type ShippyProReportShipment,
  type ShippyProOrderDetail,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<ShippyProShipment> = {}): ShippyProShipment {
  return {
    TransactionId: 'txn-555',
    OrderId: 'ord-555',
    TrackingNumber: 'UPS1234567890',
    CarrierName: 'UPS',
    ServiceName: 'UPS Ground',
    Status: 'in_transit',
    LabelUrl: 'https://labels.shippypro.com/txn-555.pdf',
    LabelFormat: 'pdf',
    ShipDate: '2024-03-01T00:00:00Z',
    DeliveryDate: '2024-03-05T00:00:00Z',
    Price: 1200,
    Currency: 'USD',
    Weight: '2.5',
    WeightUnit: 'kg',
    Reference: 'PO-1001',
    FromAddress: {
      Name: 'Warehouse A',
      Street1: '1 Origin St',
      City: 'Seattle',
      State: 'WA',
      Country: 'US',
    },
    ToAddress: {
      Name: 'Customer B',
      Street1: '2 Dest Rd',
      City: 'Portland',
      State: 'OR',
      Country: 'US',
    },
    CreatedAt: '2024-03-01T00:00:00Z',
    UpdatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (shippypro)', () => {
  it('maps id from TransactionId (preferred over OrderId)', () => {
    expect(transformShipment(makeShipment()).id).toBe('txn-555')
  })

  it('maps trackingNumber, carrierId and serviceCode', () => {
    const result = transformShipment(makeShipment())
    expect(result.trackingNumber).toBe('UPS1234567890')
    expect(result.carrierId).toBe('UPS')
    expect(result.serviceCode).toBe('UPS Ground')
  })

  it('maps all shipment statuses', () => {
    const cases: [string | null | undefined, string][] = [
      ['label_created', 'LABEL_CREATED'],
      ['pending', 'LABEL_CREATED'],
      ['in_transit', 'IN_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['error', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ Status: status ?? undefined })).status).toBe(expected)
    }
  })

  it('maps origin and destination addresses via transformAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Seattle')
    expect(result.destinationAddress?.city).toBe('Portland')
  })

  it('maps weight with correct unit resolution', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps weight unit aliases', () => {
    expect(transformShipment(makeShipment({ WeightUnit: 'lbs' })).totalWeight?.unit).toBe('lb')
    expect(transformShipment(makeShipment({ WeightUnit: 'gram' })).totalWeight?.unit).toBe('g')
    expect(transformShipment(makeShipment({ WeightUnit: null })).totalWeight?.unit).toBe('kg')
  })

  it('maps cost when both price and currency are present', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(1200)
    expect(result.cost?.currency).toBe('USD')
  })

  it('cost is undefined when currency is absent', () => {
    expect(transformShipment(makeShipment({ Currency: null })).cost).toBeUndefined()
  })

  it('maps labelUrl and reference', () => {
    const result = transformShipment(makeShipment())
    expect(result.labelUrl).toBe('https://labels.shippypro.com/txn-555.pdf')
    expect(result.reference).toBe('PO-1001')
  })

  it('maps createdAt from CreatedAt; falls back to ShipDate', () => {
    const result = transformShipment(makeShipment({ CreatedAt: null }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})

// Fixture: the documented example row of GetShipmentsReportResponse.Shipments
// (https://api.shippypro.com/docs/v1.json).
const REPORT_ROW: ShippyProReportShipment = {
  to_address: {
    name: 'John Doe',
    company: '',
    street1: '123 Main St',
    street2: '',
    city: 'Park City',
    state: 'UT',
    zip: '84060',
    country: 'US',
    phone: '5551231234',
    email: 'johndoe@gmail.com',
  },
  // from_address is `allOf` Address + otherFiscalId (example ""); Address's example values.
  from_address: {
    name: 'John Doe',
    company: '',
    street1: '123 Main St',
    street2: '',
    city: 'Park City',
    state: 'UT',
    zip: '84060',
    country: 'US',
    phone: '5551231234',
    email: 'johndoe@gmail.com',
    otherFiscalId: '',
  },
  parcels: [{ length: 5, width: 5, height: 5, weight: 10 }],
  MarketplacePlatform: 'Amazon',
  TransactionID: 'ORDER2365',
  OrderID: '1234567',
  CustomerReference: 'a1234',
  AccountNumber: '1X4834H0',
  CarrierName: 'DHLExpress',
  CarrierService: 'EXPRESS DOMESTIC',
  TrackingNumber: '1ZA103756899507566',
  TrackingExternalLink: 'https://www.GenericCarrier.com?tracking_code=1ZA103756899507566',
  Date: '1696599902',
  OrderStatus: 1,
  Hidden: 0,
  Incoterm: 'DAP',
  TotalValue: '26.71 EUR',
  insurance: 0,
  insuranceCurrency: 'EUR',
  return: false,
  return_reason: false,
  shipment_cost: 4.2,
}

describe('transformReportShipment (shippypro GetShipmentsReport row)', () => {
  it('maps the documented fields and parses with ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformReportShipment(REPORT_ROW))
    expect(s.id).toBe('1234567')
    expect(s.trackingNumber).toBe('1ZA103756899507566')
    expect(s.serviceCode).toBe('EXPRESS DOMESTIC')
    expect(s.reference).toBe('ORDER2365')
    expect(s.createdAt).toEqual(new Date(1696599902 * 1000))
    expect(s.destinationAddress?.postalCode).toBe('84060')
    expect(s.originAddress).toEqual(s.destinationAddress)
    expect(s.originAddress).not.toHaveProperty('otherFiscalId')
  })

  it('invents nothing the row does not document: no status, carrierId, cost or weight', () => {
    const s = transformReportShipment(REPORT_ROW)
    expect(s.status).toBeUndefined()
    expect(s.carrierId).toBeUndefined()
    expect(s.cost).toBeUndefined()
    expect(s.totalWeight).toBeUndefined()
    expect(s.metadata).toBe(REPORT_ROW)
  })
})

// Fixture: the documented example of GetOrderResponse.
const ORDER_DETAIL: ShippyProOrderDetail = {
  Result: 'OK',
  OrderID: '612648',
  TransactionID: '1234',
  CarrierID: '3',
  TrackingCarrier: 'DHL',
  TrackingNumber: '8599848451',
  TrackingExternalLink: 'https://mailingtechnology.com/tracking/?tn=UD26123123456',
  MarketplacePlatform: 'Amazon',
  Status: '1',
  LabelURL: ['https://cdn.shippypro.com/labels/label.pdf'],
}

describe('transformOrderDetailShipment (shippypro GetOrder)', () => {
  it('maps the documented fields and parses with ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformOrderDetailShipment(ORDER_DETAIL))
    expect(s.id).toBe('612648')
    expect(s.carrierId).toBe('3')
    expect(s.trackingNumber).toBe('8599848451')
    expect(s.reference).toBe('1234')
    expect(s.labelUrl).toBe('https://cdn.shippypro.com/labels/label.pdf')
    expect(s.status).toBe('LABEL_CREATED')
  })

  it('maps the seven documented tracking code values, and anything else to UNKNOWN', () => {
    const status = (Status: string) =>
      transformOrderDetailShipment({ ...ORDER_DETAIL, Status }).status
    expect(['0', '1', '2', '3', '4', '5', '6', '7', 'x'].map(status)).toEqual([
      'PENDING',
      'LABEL_CREATED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'EXCEPTION',
      'EXCEPTION',
      'DELIVERED',
      'UNKNOWN',
      'UNKNOWN',
    ])
  })

  it('drops a label URL that is not absolute', () => {
    const s = transformOrderDetailShipment({ ...ORDER_DETAIL, LabelURL: ['label-1.zpl'] })
    expect(s.labelUrl).toBeUndefined()
    expect(() => ShipmentSchema.parse(s)).not.toThrow()
  })
})
