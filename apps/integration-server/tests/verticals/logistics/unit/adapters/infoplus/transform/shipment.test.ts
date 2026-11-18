/**
 * Fixture: the `parcelShipment` definition of the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json).
 * The swagger ships no example body; every key below is one of its
 * properties, with a value of its declared type.
 */
import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type InfoplusParcelShipment,
} from '../../../../../../../src/verticals/logistics/adapters/infoplus/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

const DOCUMENTED: InfoplusParcelShipment = {
  id: 501,
  createDate: '2025-03-01T10:00:00.000Z',
  modifyDate: '2025-03-02T11:00:00.000Z',
  shipDate: '2025-03-01T15:00:00.000Z',
  deliveredDate: '2025-03-03T09:30:00.000Z',
  trackingNo: '1Z999AA10123456784',
  warehouseId: 7,
  lobId: 12,
  orderNo: 1001,
  cartonNo: 1,
  numberOfCartons: 1,
  status: 'Delivered',
  shipped: true,
  carrierServiceId: 3,
  dim1In: 12,
  dim2In: 8,
  dim3In: 4,
  weightLbs: 2.5,
  chargedFreightAmount: 9.25,
  externalShippingSystemId: 44,
  customFields: {},
}

describe('infoplus transformShipment', () => {
  it('maps the documented fields and parses as a Shipment', () => {
    const out = ShipmentSchema.parse(transformShipment(DOCUMENTED))
    expect(out.id).toBe('501')
    expect(out.trackingNumber).toBe('1Z999AA10123456784')
    expect(out.warehouseId).toBe('7')
    expect(out.reference).toBe('1001')
    expect(out.totalWeight).toEqual({ value: 2.5, unit: 'lb' })
    expect(out.actualDeliveryAt).toEqual(new Date('2025-03-03T09:30:00.000Z'))
    expect(out.createdAt).toEqual(new Date('2025-03-01T10:00:00.000Z'))
    expect(out.updatedAt).toEqual(new Date('2025-03-02T11:00:00.000Z'))
  })

  it('status: deliveredDate → DELIVERED, shipped without it → IN_TRANSIT, else UNKNOWN', () => {
    expect(transformShipment(DOCUMENTED).status).toBe('DELIVERED')
    expect(transformShipment({ ...DOCUMENTED, deliveredDate: null }).status).toBe('IN_TRANSIT')
    expect(transformShipment({ ...DOCUMENTED, deliveredDate: null, shipped: false }).status).toBe(
      'UNKNOWN',
    )
  })

  it('reads nothing from the undocumented status values', () => {
    const out = transformShipment({ id: 1, status: 'Delivered' })
    expect(out.status).toBe('UNKNOWN')
  })

  it('invents no carrier, cost, label URL or service code', () => {
    const out = transformShipment(DOCUMENTED)
    expect(out.carrierId).toBeUndefined()
    expect(out.cost).toBeUndefined()
    expect(out.labelUrl).toBeUndefined()
    expect(out.serviceCode).toBeUndefined()
  })
})
