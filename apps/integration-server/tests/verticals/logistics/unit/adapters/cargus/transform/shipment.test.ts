import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/cargus/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { documentedAwb } from '../fixtures/documented'

describe('cargus transformShipment (documented AwbModel)', () => {
  it('parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(documentedAwb('1000000001')))).not.toThrow()
  })

  it('maps BarCode to id and trackingNumber, ServiceId to serviceCode', () => {
    const s = ShipmentSchema.parse(transformShipment(documentedAwb('1000000001')))
    expect(s.id).toBe('1000000001')
    expect(s.trackingNumber).toBe('1000000001')
    expect(s.carrierId).toBe('cargus')
    expect(s.serviceCode).toBe('34')
    expect(s.reference).toBe('REF-1000000001')
    expect(s.notes).toBe('Fragil')
  })

  it('maps Sender and Recipient from the documented address fields, with no country', () => {
    const s = ShipmentSchema.parse(transformShipment(documentedAwb('1000000001')))
    expect(s.originAddress).toEqual({
      name: 'Ion Popescu',
      company: 'Magazin SRL',
      street1: 'Strada Victoriei 12',
      street2: 'Bloc A, ap. 3',
      city: 'Bucuresti',
      state: 'Bucuresti',
      postalCode: '010061',
      phone: '0721000001',
      email: 'ion@example.ro',
    })
    expect(s.destinationAddress?.street2).toBeUndefined()
    expect(s.destinationAddress?.country).toBeUndefined()
  })

  it('leaves status UNKNOWN (no documented values), and sets no cost, weight or label', () => {
    const s = ShipmentSchema.parse(transformShipment(documentedAwb('1000000001')))
    expect(s.status).toBe('UNKNOWN')
    expect(s.cost).toBeUndefined()
    expect(s.totalWeight).toBeUndefined()
    expect(s.labelUrl).toBeUndefined()
    expect(s.createdAt).toBeUndefined()
  })

  it('keeps the raw AWB in metadata', () => {
    const raw = documentedAwb('1000000001')
    expect(ShipmentSchema.parse(transformShipment(raw)).metadata).toEqual(raw)
  })
})
