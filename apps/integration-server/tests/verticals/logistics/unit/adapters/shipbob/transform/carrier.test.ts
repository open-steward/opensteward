import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type ShipBobShippingMethod,
} from '../../../../../../../src/verticals/logistics/adapters/shipbob/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import {
  transformShipment,
  type ShipBobShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipbob/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

/**
 * A ShipBob sync reported `carriers: 0 (skipped)` — `skipped` meaning the
 * adapter implemented no `listCarriers` at all, so no amount of data in the
 * account would ever populate it.
 *
 * The reason it was missing is that ShipBob has no carriers. It is a 3PL: the
 * merchant picks a service level and ShipBob chooses the carrier per shipment
 * from its own contracts. Probed against the live sandbox:
 *
 *     /2026-01/carrier          404
 *     /2026-01/carriers         404
 *     /2026-01/shipping-method  200  array[4]
 *
 * So this maps shipping methods, which is the nearest real thing, and keeps
 * the distinction visible rather than pretending ShipBob names a carrier.
 */

/** The exact shape returned by the live sandbox. */
function makeMethod(overrides: Partial<ShipBobShippingMethod> = {}): ShipBobShippingMethod {
  return {
    id: 236457,
    active: true,
    default: true,
    name: 'ShipBob Default',
    service_level: { id: 3, name: 'Standard' },
    ...overrides,
  }
}

describe('shipbob transformCarrier', () => {
  it('maps id, name and active', () => {
    const c = transformCarrier(makeMethod())
    expect(c.id).toBe('236457')
    expect(c.name).toBe('ShipBob Default')
    expect(c.isActive).toBe(true)
  })

  it('stringifies the numeric id', () => {
    // ShipBob returns a number; every id we expose is a string. A number here
    // would not match `ship_option` on a shipment, which is where a caller
    // joins back to it.
    expect(typeof transformCarrier(makeMethod()).id).toBe('string')
  })

  it('carries the service level as the single service entry', () => {
    const c = transformCarrier(makeMethod())
    expect(c.services).toEqual([{ code: '3', name: 'Standard' }])
  })

  it('omits services entirely when there is no service level', () => {
    // `code` is REQUIRED on CarrierService, so a level-less method must
    // contribute no entry rather than one keyed on an empty string — which
    // would parse but be unjoinable.
    const c = transformCarrier(makeMethod({ service_level: null }))
    expect(c.services).toBeUndefined()
  })

  it('uses the method id as the code, since ShipBob has no carrier code', () => {
    expect(transformCarrier(makeMethod()).code).toBe('236457')
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeMethod()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeMethod()))).not.toThrow()
  })

  it('parses a sparse method too', () => {
    const sparse = { id: 1 } as ShipBobShippingMethod
    expect(CarrierSchema.safeParse(transformCarrier(sparse)).success).toBe(true)
  })
})

/**
 * Separate defect, same adapter: ShipBob returns carrier and tracking NESTED
 * under `tracking`, on both the order-level summary and the detail route:
 *
 *     "tracking": { "carrier": "Amazon Shipping",
 *                   "tracking_number": "TBA334553295083",
 *                   "carrier_service": "Amazon Shipping Ground" }
 *
 * The transforms read flat `raw.tracking_number` / `raw.carrier`, which do not
 * exist on either shape. `?? undefined` then produced shipments with no
 * tracking number, no carrier and no service — 17 of them — while the upstream
 * data had all three. The raw interface's index signature meant TypeScript
 * never objected.
 */
describe('shipbob shipment tracking is read from the nested object', () => {
  const nested = {
    id: 107599796,
    order_id: 23746709,
    status: 'LabeledCreated',
    tracking: {
      carrier: 'Amazon Shipping',
      tracking_number: 'TBA334553295083',
      carrier_service: 'Amazon Shipping Ground',
      tracking_url: 'https://track.amazon.com/tracking/TBA334553295083',
    },
  } as unknown as ShipBobShipment

  it('reads trackingNumber, carrierId and serviceCode from `tracking`', () => {
    const s = transformShipment(nested)
    expect(s.trackingNumber).toBe('TBA334553295083')
    expect(s.carrierId).toBe('Amazon Shipping')
    expect(s.serviceCode).toBe('Amazon Shipping Ground')
  })

  it('still honours the older flat shape', () => {
    // ShipBob's 1.0 API served these flat. The fallback is why that shape is
    // not broken by fixing this one.
    const flat = {
      id: 1,
      status: 'Completed',
      tracking: null,
      tracking_number: 'FLAT123',
      carrier: 'UPS',
      carrier_service: 'Ground',
    } as unknown as ShipBobShipment
    const s = transformShipment(flat)
    expect(s.trackingNumber).toBe('FLAT123')
    expect(s.carrierId).toBe('UPS')
  })

  it('prefers the nested value when both are present', () => {
    const both = { ...nested, tracking_number: 'STALE', carrier: 'STALE' } as unknown as ShipBobShipment
    expect(transformShipment(both).trackingNumber).toBe('TBA334553295083')
  })

  it('leaves tracking fields undefined when the shipment genuinely has none', () => {
    // A shipment before its label is created really does have no tracking.
    // That must stay undefined rather than becoming a fabricated value.
    const none = { id: 2, status: 'Processing', tracking: null } as unknown as ShipBobShipment
    const s = transformShipment(none)
    expect(s.trackingNumber).toBeUndefined()
    expect(s.carrierId).toBeUndefined()
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => ShipmentSchema.parse(transformShipment(nested))).not.toThrow()
  })
})
