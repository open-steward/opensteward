import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  transformLabelUrl,
  labelUrls,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/label'
import type { ShippyProShipment } from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// transformLabel takes a ShippyProShipment (not a separate label type)

function makeShipment(overrides: Partial<ShippyProShipment> = {}): ShippyProShipment {
  return {
    TransactionId: 'txn-001',
    OrderId: 'ord-001',
    TrackingNumber: 'FEDEX123456',
    CarrierName: 'FedEx',
    ServiceName: 'FedEx Ground',
    LabelUrl: 'https://labels.shippypro.com/txn-001.pdf',
    LabelFormat: 'pdf',
    ShipDate: '2024-03-01T00:00:00Z',
    CreatedAt: '2024-03-01T00:00:00Z',
    UpdatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (shippypro)', () => {
  it('maps id from TransactionId (preferred over OrderId)', () => {
    expect(transformLabel(makeShipment()).id).toBe('txn-001')
  })

  it('maps shipmentId from OrderId', () => {
    expect(transformLabel(makeShipment()).shipmentId).toBe('ord-001')
  })

  it('maps trackingNumber and carrierId', () => {
    const result = transformLabel(makeShipment())
    expect(result.trackingNumber).toBe('FEDEX123456')
    expect(result.carrierId).toBe('FedEx')
  })

  it('maps serviceCode from ServiceName', () => {
    expect(transformLabel(makeShipment()).serviceCode).toBe('FedEx Ground')
  })

  it('always sets status to CREATED', () => {
    expect(transformLabel(makeShipment()).status).toBe('CREATED')
  })

  it('maps format via substring matching', () => {
    expect(transformLabel(makeShipment({ LabelFormat: 'pdf' })).format).toBe('PDF')
    expect(transformLabel(makeShipment({ LabelFormat: 'label-zpl-v2' })).format).toBe('ZPL')
    expect(transformLabel(makeShipment({ LabelFormat: 'image/png' })).format).toBe('PNG')
    expect(transformLabel(makeShipment({ LabelFormat: 'epl2-label' })).format).toBe('EPL2')
    expect(transformLabel(makeShipment({ LabelFormat: 'unknown' })).format).toBeUndefined()
  })

  it('maps url', () => {
    expect(transformLabel(makeShipment()).url).toBe('https://labels.shippypro.com/txn-001.pdf')
  })

  it('falls back to OrderId when TransactionId is null', () => {
    const result = transformLabel(makeShipment({ TransactionId: null }))
    expect(result.id).toBe('ord-001')
  })

  it('maps createdAt from CreatedAt; falls back to ShipDate', () => {
    const result = transformLabel(makeShipment({ CreatedAt: null }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema.parse without throwing', () => {
    expect(() => LabelSchema.parse(transformLabel(makeShipment()))).not.toThrow()
  })
})

// Fixture: the documented example of GetLabelUrlResponse (https://api.shippypro.com/docs/v1.json).
describe('transformLabelUrl (shippypro GetLabelUrl)', () => {
  const DOC = {
    LabelURL: 'https://cdn.shippypro.com/labels/label.pdf',
    TrackingCarrier: 'UPS',
    TrackingNumber: '123456',
    TrackingExternalLink: 'https://mailingtechnology.com/tracking/?tn=UD26123123456',
    DeliveryCarrier: 'PostNL Packet Tracked',
    Status: 1,
  }

  it('maps the label URL and tracking number; id is the OrderID asked for', () => {
    const l = LabelSchema.parse(transformLabelUrl('1234', DOC))
    expect(l.id).toBe('1234')
    expect(l.shipmentId).toBe('1234')
    expect(l.url).toBe('https://cdn.shippypro.com/labels/label.pdf')
    expect(l.trackingNumber).toBe('123456')
    expect(l.format).toBeUndefined()
    expect(l.base64).toBeUndefined()
  })

  it('reads LabelURL as a string, an array, or the empty array of an order in error', () => {
    expect(labelUrls(DOC)).toEqual(['https://cdn.shippypro.com/labels/label.pdf'])
    expect(labelUrls({ LabelURL: ['https://a.example/1.pdf', 'https://a.example/2.pdf'] })).toEqual(
      ['https://a.example/1.pdf', 'https://a.example/2.pdf'],
    )
    expect(labelUrls({ LabelURL: [] })).toEqual([])
    expect(transformLabelUrl('1', { LabelURL: [] }).url).toBeUndefined()
  })

  it('never puts a relative LabelURL in url: it takes the first absolute one, or none', () => {
    const mixed = transformLabelUrl('1', {
      LabelURL: ['labels/1.pdf', 'https://cdn.shippypro.com/labels/2.pdf'],
    })
    expect(LabelSchema.parse(mixed).url).toBe('https://cdn.shippypro.com/labels/2.pdf')
    const relative = transformLabelUrl('1', { LabelURL: '/labels/1.pdf', PDF: ['JVBERi0x'] })
    expect(relative.url).toBeUndefined()
    expect(() => LabelSchema.parse(relative)).not.toThrow()
  })

  it('puts a base64 PDF body in base64 with format PDF', () => {
    const l = LabelSchema.parse(transformLabelUrl('1', { LabelURL: [], PDF: ['JVBERi0x'] }))
    expect(l.base64).toBe('JVBERi0x')
    expect(l.format).toBe('PDF')
    expect(l.url).toBeUndefined()
  })
})
