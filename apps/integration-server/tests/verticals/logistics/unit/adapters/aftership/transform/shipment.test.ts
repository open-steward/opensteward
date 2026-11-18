import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/aftership/transform/shipment'
import type { AfterShipTracking } from '../../../../../../../src/verticals/logistics/adapters/aftership/transform/tracking'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

/**
 * The logistics resource audit listed `aftership/shipment` as a backlog cell:
 * the adapter declared it unavailable ("no standalone /shipments endpoint")
 * while `listTrackingEvents` was already paging the collection that IS
 * AfterShip's shipment record. This maps that record; the checkpoints inside
 * it stay with `transformTracker`.
 *
 * Fixture shape is the 2024-10 `GET /trackings/{id}` response body's `data`
 * (no `data.tracking` wrapper — that was v4).
 */
function makeTracking(overrides: Partial<AfterShipTracking> = {}): AfterShipTracking {
  return {
    id: 'trk_aftership_abc123',
    tracking_number: '9400111899223397643730',
    slug: 'usps',
    tag: 'InTransit',
    subtag: 'InTransit_002',
    subtag_message: 'In transit to destination',
    title: '9400111899223397643730',
    active: true,
    origin_country_iso3: 'USA',
    origin_city: 'San Francisco',
    origin_state: 'CA',
    origin_postal_code: '94105',
    destination_country_iso3: 'USA',
    destination_city: 'Austin',
    destination_state: 'TX',
    destination_postal_code: '78701',
    signed_by: null,
    transit_time: 3,
    checkpoints: [],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T14:35:00Z',
    order_id: 'ord_7f3a',
    order_number: '1042',
    courier_tracking_link: null,
    shipment_delivery_date: null,
    shipment_pickup_date: '2024-01-15T08:00:00Z',
    shipment_type: 'Priority Mail',
    return_to_sender: false,
    latest_estimated_delivery: {
      type: 'specific',
      source: 'Carrier EDD',
      datetime: '2024-01-18T00:00:00Z',
      datetime_min: null,
      datetime_max: null,
    },
    ...overrides,
  }
}

describe('aftership transformShipment', () => {
  it('maps id, tracking number and carrier', () => {
    const s = transformShipment(makeTracking())
    expect(s.id).toBe('trk_aftership_abc123')
    expect(s.trackingNumber).toBe('9400111899223397643730')
    expect(s.carrierId).toBe('usps')
  })

  it('uses the courier slug as carrierId, which is Carrier.id in transform/carrier.ts', () => {
    // A caller joins a shipment back to listCarriers on this value, so it has
    // to be the slug and not the courier's display name.
    expect(transformShipment(makeTracking({ slug: 'dhl' })).carrierId).toBe('dhl')
  })

  it('maps shipment_type to serviceCode', () => {
    expect(transformShipment(makeTracking()).serviceCode).toBe('Priority Mail')
    expect(transformShipment(makeTracking({ shipment_type: null })).serviceCode).toBeUndefined()
  })

  describe('status from tag', () => {
    // Every value of the spec's closed `tag` enum, pinned individually.
    it.each([
      ['Pending', 'PENDING'],
      ['InfoReceived', 'LABEL_CREATED'],
      ['InTransit', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['AvailableForPickup', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['AttemptFail', 'EXCEPTION'],
      ['Exception', 'EXCEPTION'],
      ['Expired', 'UNKNOWN'],
    ] as const)('maps %s → %s', (tag, expected) => {
      expect(transformShipment(makeTracking({ tag })).status).toBe(expected)
    })

    it('maps a tag the enum does not list to UNKNOWN', () => {
      expect(transformShipment(makeTracking({ tag: 'Teleported' })).status).toBe('UNKNOWN')
    })

    it('reports RETURNED when return_to_sender is set, whatever the tag', () => {
      // AfterShip tags a return as a bare Exception (subtag Exception_010/011)
      // and exposes the derived boolean; the boolean is the one signal that
      // distinguishes "returned" from every other exception.
      const s = transformShipment(makeTracking({ tag: 'Exception', return_to_sender: true }))
      expect(s.status).toBe('RETURNED')
    })

    it('does not report RETURNED on a pre-2024-10 record that lacks the flag', () => {
      expect(transformShipment(makeTracking({ return_to_sender: undefined })).status).toBe(
        'IN_TRANSIT',
      )
    })
  })

  describe('addresses', () => {
    it('maps the flat origin_* columns to originAddress', () => {
      const s = transformShipment(makeTracking())
      expect(s.originAddress).toEqual({ city: 'San Francisco', state: 'CA', postalCode: '94105' })
    })

    it('maps the flat destination_* columns to destinationAddress', () => {
      const s = transformShipment(makeTracking())
      expect(s.destinationAddress).toEqual({ city: 'Austin', state: 'TX', postalCode: '78701' })
    })

    it('leaves country undefined even though AfterShip supplies one', () => {
      // AfterShip's `*_country_iso3` is alpha-3 ("USA"); AddressSchema.country
      // is Iso3166Alpha2 and rejects it. Passing it through would make every
      // shipment with a known origin fail the schema — the raw code stays on
      // metadata instead.
      const s = transformShipment(makeTracking())
      expect(s.originAddress?.country).toBeUndefined()
      expect(s.destinationAddress?.country).toBeUndefined()
      expect(s.metadata?.origin_country_iso3).toBe('USA')
    })

    it('omits an address whose columns are all null', () => {
      const s = transformShipment(
        makeTracking({
          origin_city: null,
          origin_state: null,
          origin_postal_code: null,
          origin_country_iso3: null,
        }),
      )
      expect(s.originAddress).toBeUndefined()
      expect(s.destinationAddress).toBeDefined()
    })
  })

  describe('dates', () => {
    it('maps latest_estimated_delivery.datetime to estimatedDeliveryAt', () => {
      const s = transformShipment(makeTracking())
      expect(s.estimatedDeliveryAt).toEqual(new Date('2024-01-18T00:00:00Z'))
    })

    it('leaves estimatedDeliveryAt undefined when there is no EDD', () => {
      expect(
        transformShipment(makeTracking({ latest_estimated_delivery: null })).estimatedDeliveryAt,
      ).toBeUndefined()
      expect(
        transformShipment(
          makeTracking({
            latest_estimated_delivery: {
              type: 'range',
              source: 'AfterShip EDD',
              datetime: null,
              datetime_min: '2024-01-17',
              datetime_max: '2024-01-19',
            },
          }),
        ).estimatedDeliveryAt,
      ).toBeUndefined()
    })

    it('maps shipment_delivery_date to actualDeliveryAt', () => {
      const s = transformShipment(
        makeTracking({ tag: 'Delivered', shipment_delivery_date: '2024-01-18T15:22:00Z' }),
      )
      expect(s.actualDeliveryAt).toEqual(new Date('2024-01-18T15:22:00Z'))
    })

    it('accepts the date-only form the spec allows for carrier dates', () => {
      const s = transformShipment(makeTracking({ shipment_delivery_date: '2024-01-18' }))
      expect(s.actualDeliveryAt).toBeInstanceOf(Date)
      expect(Number.isNaN(s.actualDeliveryAt!.getTime())).toBe(false)
    })

    it('leaves actualDeliveryAt undefined while undelivered', () => {
      expect(transformShipment(makeTracking()).actualDeliveryAt).toBeUndefined()
    })

    it('maps created_at and updated_at', () => {
      const s = transformShipment(makeTracking())
      expect(s.createdAt).toEqual(new Date('2024-01-15T10:00:00Z'))
      expect(s.updatedAt).toEqual(new Date('2024-01-15T14:35:00Z'))
    })
  })

  it('maps order_id to reference', () => {
    expect(transformShipment(makeTracking()).reference).toBe('ord_7f3a')
    expect(transformShipment(makeTracking({ order_id: null })).reference).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeTracking()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeTracking()))).not.toThrow()
  })

  it('still parses with alpha-3 country codes on the raw record', () => {
    // The assertion that would have failed had country been passed through.
    const raw = makeTracking({ origin_country_iso3: 'DEU', destination_country_iso3: 'GBR' })
    expect(ShipmentSchema.safeParse(transformShipment(raw)).success).toBe(true)
  })

  it('parses a sparse record too', () => {
    const sparse = {
      id: 'trk_1',
      tracking_number: '1',
      slug: 'usps',
      tag: 'Pending',
    } as AfterShipTracking
    expect(ShipmentSchema.safeParse(transformShipment(sparse)).success).toBe(true)
  })
})
