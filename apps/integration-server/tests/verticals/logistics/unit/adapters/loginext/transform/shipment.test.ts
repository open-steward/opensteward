import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  mapShipmentStatus,
} from '../../../../../../../src/verticals/logistics/adapters/loginext/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { docOrderRow, docOrderRowWithAwb } from '../fixtures'

describe('loginext transformShipment (Order Get API row)', () => {
  it('maps the documented example row and parses as a Shipment', () => {
    const raw = docOrderRowWithAwb()
    const s = ShipmentSchema.parse(transformShipment(raw))
    expect(s.id).toBe('GR432U5')
    expect(s.status).toBe('DELIVERED')
    expect(s.trackingNumber).toBe('435-16685675')
    expect(s.estimatedDeliveryAt?.toISOString()).toBe(new Date(1597327443000).toISOString())
    expect(s.createdAt?.toISOString()).toBe(new Date(1485153536000).toISOString())
    expect(s.notes).toBe('Order recieved successfully.Thanks')
    expect(s.metadata).toEqual(raw)
  })

  it('invents nothing the row does not carry', () => {
    const s = ShipmentSchema.parse(transformShipment(docOrderRow()))
    expect(s.trackingNumber).toBeUndefined()
    expect(s.estimatedDeliveryAt).toBeUndefined()
    expect(s.carrierId).toBeUndefined()
    expect(s.cost).toBeUndefined()
    expect(s.originAddress).toBeUndefined()
    expect(s.destinationAddress).toBeUndefined()
  })

  it('throws on a row without an orderNo rather than inventing an id', () => {
    expect(() => transformShipment({ ...docOrderRow(), orderNo: '' })).toThrow(/orderNo/)
  })

  it.each([
    ['NOTDISPATCHED', 'PENDING'],
    ['INTRANSIT', 'IN_TRANSIT'],
    ['PICKEDUP', 'IN_TRANSIT'],
    ['DELIVERED', 'DELIVERED'],
    ['COMPLETED', 'DELIVERED'],
    ['NOTPICKEDUP', 'EXCEPTION'],
    ['NOTDELIVERED', 'EXCEPTION'],
    ['NOTCOMPLETED', 'EXCEPTION'],
    ['CANCELLED', 'CANCELLED'],
    ['SOMETHING_ELSE', 'UNKNOWN'],
    // Only the documented upper-case values are matched.
    ['delivered', 'UNKNOWN'],
  ] as const)('maps status %s to %s', (status, expected) => {
    expect(mapShipmentStatus(status)).toBe(expected)
    expect(ShipmentSchema.parse(transformShipment({ ...docOrderRow(), status })).status).toBe(
      expected,
    )
  })

  it('leaves status out when the row has none', () => {
    expect(transformShipment({ ...docOrderRow(), status: undefined }).status).toBeUndefined()
  })
})
