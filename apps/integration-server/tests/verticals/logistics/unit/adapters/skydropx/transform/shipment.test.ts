import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/skydropx/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { docAddress, docPackage, docShipment, docShipmentsResponse } from '../fixtures'

describe('Skydropx transformShipment (PRO GET /api/v1/shipments)', () => {
  it('maps the documented list example and parses as ShipmentSchema', () => {
    const res = docShipmentsResponse()
    const out = ShipmentSchema.parse(transformShipment(res.data![0]!, res.included))
    expect(out.id).toBe('0ac5adcc-a13d-427d-81dd-9ddd70b2f660')
    expect(out.carrierId).toBe('fedex')
    expect(out.trackingNumber).toBe('234234234233')
    expect(out.status).toBe('LABEL_CREATED')
    expect(out.labelUrl).toBe('https://label.com')
    expect(out.packages).toEqual([{ id: 'pkg-1', trackingNumber: '234234234233' }])
    expect(out.originAddress?.postalCode).toBe('15400')
    expect(out.destinationAddress?.city).toBe('Venustiano Carranza')
    expect(out.createdAt?.toISOString()).toBe('2024-09-05T23:13:00.000Z')
    expect(out.updatedAt?.toISOString()).toBe('2024-09-06T10:00:00.000Z')
  })

  it('omits cost: total is documented without a currency', () => {
    const res = docShipmentsResponse()
    expect(transformShipment(res.data![0]!, res.included).cost).toBeUndefined()
  })

  it('omits weight and dimensions: package units are undocumented', () => {
    const res = docShipmentsResponse()
    const out = transformShipment(res.data![0]!, res.included)
    expect(out.totalWeight).toBeUndefined()
    expect(out.dimensions).toBeUndefined()
    expect(out.packages?.[0]?.weight).toBeUndefined()
  })

  it('resolves addresses by relationship id AND type', () => {
    const s = docShipment('s1', [])
    const wrongType = { ...docAddress('s1-from', 'from'), type: 'other' }
    const out = transformShipment(s, [wrongType, docAddress('s1-to', 'to')])
    expect(out.originAddress).toBeUndefined()
    expect(out.destinationAddress?.name).toBe('Juan')
  })

  it.each([
    ['created', 'LABEL_CREATED'],
    ['picked_up', 'IN_TRANSIT'],
    ['in_transit', 'IN_TRANSIT'],
    ['last_mile', 'OUT_FOR_DELIVERY'],
    ['delivered', 'DELIVERED'],
    ['exception', 'EXCEPTION'],
    ['in_return', 'RETURNED'],
    ['canceled', 'CANCELLED'],
    ['something_else', 'UNKNOWN'],
  ])('status from the master package tracking_status %s -> %s', (raw, expected) => {
    const s = docShipment('s1', ['p1'])
    const out = transformShipment(s, [docPackage('p1', 's1', { tracking_status: raw })])
    expect(ShipmentSchema.parse(out).status).toBe(expected)
  })

  it('with several packages uses the one carrying master_tracking_number', () => {
    const s = docShipment('s1', ['p1', 'p2'], { master_tracking_number: 'T2' })
    const out = transformShipment(s, [
      docPackage('p1', 's1', { tracking_number: 'T1', tracking_status: 'in_transit' }),
      docPackage('p2', 's1', { tracking_number: 'T2', tracking_status: 'delivered' }),
    ])
    expect(out.status).toBe('DELIVERED')
    // No single label for a multi-package shipment.
    expect(out.labelUrl).toBeUndefined()
  })

  it('several packages and no master match -> UNKNOWN', () => {
    const s = docShipment('s1', ['p1', 'p2'], { master_tracking_number: null })
    const out = transformShipment(s, [
      docPackage('p1', 's1', { tracking_status: 'in_transit' }),
      docPackage('p2', 's1', { tracking_status: 'delivered' }),
    ])
    expect(out.status).toBe('UNKNOWN')
  })

  it('a numeric tracking_number (as the docs example shows) becomes a string', () => {
    const s = docShipment('s1', ['p1'])
    const out = transformShipment(s, [docPackage('p1', 's1', { tracking_number: 123123123123 })])
    expect(ShipmentSchema.parse(out).packages?.[0]?.trackingNumber).toBe('123123123123')
  })

  it('a relative label_url is not a labelUrl', () => {
    const s = docShipment('s1', ['p1'])
    const out = transformShipment(s, [docPackage('p1', 's1', { label_url: '/labels/1.pdf' })])
    expect(ShipmentSchema.parse(out).labelUrl).toBeUndefined()
  })

  it('leaves out timestamps that carry no zone rather than reading them in local time', () => {
    const s = docShipment('s1', [], { created_at: '2024-09-05T23:13:00', updated_at: null })
    const out = transformShipment(s, [])
    expect(out.createdAt).toBeUndefined()
    expect(out.updatedAt).toBeUndefined()
  })
})
