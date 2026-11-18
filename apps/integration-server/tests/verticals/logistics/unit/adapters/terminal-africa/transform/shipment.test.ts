/**
 * transformShipment over the documented v1 shipment examples (see ../fixtures.ts).
 */
import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { confirmedShipment, draftShipment } from '../fixtures'

describe('terminal-africa transformShipment: GET /v1/shipments example (draft, populated)', () => {
  const out = ShipmentSchema.parse(transformShipment(draftShipment()))

  it('ids by shipment_id, the id GET /v1/shipments/:shipment_id takes', () => {
    expect(out.id).toBe('SH-40208776515')
  })

  it("maps status 'draft' to PENDING", () => {
    expect(out.status).toBe('PENDING')
  })

  it('maps the populated addresses; alpha-3 countries are left out', () => {
    expect(out.originAddress).toEqual({
      name: 'Augustus Obi',
      street1: '1121 Allen Avenue, Ikeja',
      city: 'Lagos',
      state: 'Lagos',
      postalCode: '121006',
      phone: '+2348122340000',
      email: 'augustus_obi@shipmonk.ng',
    })
    expect(out.destinationAddress?.name).toBe('Timothy Odunubi')
    expect(out.destinationAddress?.country).toBeUndefined()
    expect(out.returnAddress?.street1).toBe('1121 Allen Avenue, Ikeja')
  })

  it('reads parcel.total_weight in kg', () => {
    expect(out.totalWeight).toEqual({ value: 2.51, unit: 'kg' })
  })

  it('has no tracking number, carrier, label or cost', () => {
    expect(out.trackingNumber).toBeUndefined()
    expect(out.carrierId).toBeUndefined()
    expect(out.labelUrl).toBeUndefined()
    expect(out.cost).toBeUndefined()
  })

  it('maps created_at / updated_at', () => {
    expect(out.createdAt?.toISOString()).toBe('2021-07-13T20:25:53.011Z')
    expect(out.updatedAt?.toISOString()).toBe('2021-07-13T20:25:53.011Z')
  })
})

describe('terminal-africa transformShipment: shipment embedded in GET /v1/insurance/:id (confirmed)', () => {
  const raw = confirmedShipment()
  const out = ShipmentSchema.parse(transformShipment(raw))

  it("maps status 'confirmed' to LABEL_CREATED", () => {
    expect(out.status).toBe('LABEL_CREATED')
  })

  it('reads extras.tracking_number and extras.shipping_label_url', () => {
    expect(out.trackingNumber).toBe('2604444253')
    expect(out.labelUrl).toBe(
      'https://sandbox.terminal.africa/v1/shipments/label/SH-02314736509.pdf',
    )
  })

  it('reads carrier as the carrier id', () => {
    expect(out.carrierId).toBe('CA-81957188177')
  })

  it('leaves unpopulated address and parcel ids out', () => {
    expect(out.originAddress).toBeUndefined()
    expect(out.destinationAddress).toBeUndefined()
    expect(out.totalWeight).toBeUndefined()
  })

  it('maps delivery_date to estimatedDeliveryAt', () => {
    expect(out.estimatedDeliveryAt?.toISOString()).toBe('2022-11-23T12:00:23.553Z')
  })

  it('keeps the raw object as metadata', () => {
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

describe('terminal-africa transformShipment: documented statuses', () => {
  it.each([
    ['cancelled', 'CANCELLED'],
    ['confirmed', 'LABEL_CREATED'],
    ['delivered', 'DELIVERED'],
    ['draft', 'PENDING'],
    ['in-transit', 'IN_TRANSIT'],
    ['pending', 'PENDING'],
    ['returned', 'UNKNOWN'],
  ])('%s -> %s', (status, expected) => {
    expect(ShipmentSchema.parse(transformShipment({ ...draftShipment(), status })).status).toBe(
      expected,
    )
  })

  it('drops a weight in a unit the docs do not name', () => {
    const raw = draftShipment()
    raw.parcel = { total_weight: 3, weight_unit: 'stone' }
    expect(transformShipment(raw).totalWeight).toBeUndefined()
  })

  it('drops a label url whose scheme is not http or https', () => {
    const raw = confirmedShipment()
    raw.extras = { shipping_label_url: 'ftp://files.example/SH-1.pdf' }
    expect(ShipmentSchema.parse(transformShipment(raw)).labelUrl).toBeUndefined()
  })

  it('leaves carrierId out when carrier arrives populated as an object', () => {
    const raw = confirmedShipment()
    ;(raw as { carrier: unknown }).carrier = { carrier_id: 'CA-81957188177', name: 'DHL' }
    expect(ShipmentSchema.parse(transformShipment(raw)).carrierId).toBeUndefined()
  })

  it('drops a label url that is not absolute', () => {
    const raw = confirmedShipment()
    raw.extras = { shipping_label_url: '/v1/shipments/label/SH-1.pdf' }
    expect(ShipmentSchema.parse(transformShipment(raw)).labelUrl).toBeUndefined()
  })
})
