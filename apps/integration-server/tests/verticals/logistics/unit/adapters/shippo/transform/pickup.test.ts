import { describe, it, expect } from 'vitest'
import {
  transformPickup,
  type ShippoPickup,
} from '../../../../../../../src/verticals/logistics/adapters/shippo/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import { ShippoAdapter } from '../../../../../../../src/verticals/logistics/adapters/shippo'
import type { PickupRequestParams } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * Shippo's public API has exactly one pickup operation, `POST /pickups`
 * (USPS and DHL Express accounts). The spec defines no list, get or cancel —
 * its own `cancel_by_time` text says to contact the carrier directly with
 * `confirmation_code` — so this adapter schedules and nothing more.
 */

/** The `POST /pickups` example body from the public spec, with the server-set fields a 201 adds. */
function makePickup(overrides: Partial<ShippoPickup> = {}): ShippoPickup {
  return {
    object_id: 'e1c5d7e2f1a94b0c8f4c6b2a3d9e8f70',
    object_created: '2020-05-08T17:09:48.028Z',
    object_updated: '2020-05-08T17:09:48.028Z',
    carrier_account: '6c51273296864869829b96a80fb13ea1',
    location: {
      building_location_type: 'Other',
      building_type: 'suite',
      instructions: 'Behind screen door',
      address: {
        name: 'Mrs Hippo',
        company: 'Hungry Hippos',
        street1: '965 Mission St #201',
        city: 'San Francisco',
        state: 'CA',
        zip: '95122',
        country: 'US',
        phone: '+14159876543',
        email: 'mrshippo@shippo.com',
      },
    },
    transactions: ['7439c279b374494c9a80ca24f59e6fc5'],
    requested_start_time: '2020-05-12T12:00:00Z',
    requested_end_time: '2020-05-12T16:00:00Z',
    confirmed_start_time: '2020-05-09T12:00:00Z',
    confirmed_end_time: '2020-05-09T23:59:59.999Z',
    cancel_by_time: '2020-05-09T08:00:00Z',
    status: 'CONFIRMED',
    confirmation_code: 'WTC310058750',
    timezone: 'US/Pacific',
    messages: [],
    metadata: 'Customer ID 123456',
    is_test: false,
    ...overrides,
  }
}

describe('shippo transformPickup', () => {
  it('maps id, confirmation code and carrier account', () => {
    const p = transformPickup(makePickup())
    expect(p.id).toBe('e1c5d7e2f1a94b0c8f4c6b2a3d9e8f70')
    expect(p.confirmationNumber).toBe('WTC310058750')
    expect(p.carrierId).toBe('6c51273296864869829b96a80fb13ea1')
  })

  it('leaves carrierId undefined rather than defaulting it', () => {
    // manifest.ts falls back to 'shippo'; a pickup with no carrier account is
    // not a Shippo-carrier pickup, so nothing is invented here.
    expect(transformPickup(makePickup({ carrier_account: undefined })).carrierId).toBeUndefined()
  })

  describe('status', () => {
    it.each([
      ['PENDING', 'PENDING'],
      ['CONFIRMED', 'SCHEDULED'],
      ['ERROR', 'FAILED'],
      ['CANCELLED', 'CANCELLED'],
    ])('maps %s → %s', (raw, canonical) => {
      expect(transformPickup(makePickup({ status: raw })).status).toBe(canonical)
    })

    it('is case-insensitive', () => {
      expect(transformPickup(makePickup({ status: 'confirmed' })).status).toBe('SCHEDULED')
    })

    it("maps an unmapped value to 'unknown', never to a guess", () => {
      expect(transformPickup(makePickup({ status: 'SCHEDULED_LATER' })).status).toBe('unknown')
    })

    it("maps a missing status to 'unknown'", () => {
      expect(transformPickup(makePickup({ status: undefined })).status).toBe('unknown')
    })
  })

  it('reads the pickup window from the requested times, not the confirmed ones', () => {
    // `requested_*` is what the shipper sent, so a create round-trips its own
    // input. The carrier's confirmed window differs in the fixture on purpose
    // and stays reachable through `metadata`.
    const p = transformPickup(makePickup())
    expect(p.readyAt).toEqual(new Date('2020-05-12T12:00:00Z'))
    expect(p.closeAt).toEqual(new Date('2020-05-12T16:00:00Z'))
    expect(p.readyAt).not.toEqual(new Date('2020-05-09T12:00:00Z'))
  })

  it('carries the transaction ids as shipmentIds', () => {
    expect(transformPickup(makePickup()).shipmentIds).toEqual(['7439c279b374494c9a80ca24f59e6fc5'])
  })

  it('leaves shipmentIds undefined when transactions are absent', () => {
    expect(transformPickup(makePickup({ transactions: undefined })).shipmentIds).toBeUndefined()
  })

  it('maps the location address to the canonical shape', () => {
    expect(transformPickup(makePickup()).address).toEqual({
      name: 'Mrs Hippo',
      company: 'Hungry Hippos',
      street1: '965 Mission St #201',
      street2: undefined,
      city: 'San Francisco',
      state: 'CA',
      postalCode: '95122',
      country: 'US',
      phone: '+14159876543',
      email: 'mrshippo@shippo.com',
    })
  })

  it('reads driver instructions from the location', () => {
    expect(transformPickup(makePickup()).instructions).toBe('Behind screen door')
  })

  it('leaves address and instructions undefined without a location', () => {
    const p = transformPickup(makePickup({ location: undefined }))
    expect(p.address).toBeUndefined()
    expect(p.instructions).toBeUndefined()
  })

  it('parses the object timestamps', () => {
    const p = transformPickup(makePickup())
    expect(p.createdAt).toEqual(new Date('2020-05-08T17:09:48.028Z'))
    expect(p.updatedAt).toEqual(new Date('2020-05-08T17:09:48.028Z'))
  })

  it('preserves the raw payload by reference', () => {
    const raw = makePickup()
    expect(transformPickup(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(transformPickup(makePickup()))).not.toThrow()
  })

  it('parses a sparse pickup too', () => {
    const sparse = { object_id: 'p1' } as ShippoPickup
    expect(PickupSchema.safeParse(transformPickup(sparse)).success).toBe(true)
  })
})

/**
 * `POST /pickups` marks `carrier_account`, `transactions`, `requested_end_time`
 * and `location.building_location_type` required. The first three are
 * optional canonical keys and the last only rides on the index signature, so
 * the adapter names whichever is missing before any request leaves — a bare
 * Error would surface as a 500 with its message hidden, so these carry a 400.
 */
describe('shippo createPickup names what Shippo needs and the request lacks', () => {
  const adapter = new ShippoAdapter()
  const credentials = { accessToken: 'shippo_test_token' }
  const params: PickupRequestParams = {
    address: {
      name: 'Mrs Hippo',
      street1: '965 Mission St #201',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '95122',
      country: 'US',
    },
    readyAt: new Date('2020-05-12T12:00:00Z'),
    closeAt: new Date('2020-05-12T16:00:00Z'),
    carrierId: '6c51273296864869829b96a80fb13ea1',
    shipmentIds: ['7439c279b374494c9a80ca24f59e6fc5'],
    buildingLocationType: 'Front Door',
  }

  it.each([
    ['carrierId', { carrierId: undefined }],
    ['shipmentIds', { shipmentIds: [] }],
    ['closeAt', { closeAt: undefined }],
    ['buildingLocationType', { buildingLocationType: undefined }],
  ])('rejects a missing %s as a 400 that names it', async (key, override) => {
    const promise = adapter.createPickup(credentials, { ...params, ...override })
    await expect(promise).rejects.toThrow(key)
    await expect(promise).rejects.toMatchObject({ statusCode: 400 })
  })

  it('requires instructions when the building location type is "Other"', async () => {
    // Shippo: "This is a mandatory field if the building_location_type is Other".
    const promise = adapter.createPickup(credentials, {
      ...params,
      buildingLocationType: 'Other',
    })
    await expect(promise).rejects.toThrow('instructions')
    await expect(promise).rejects.toMatchObject({ statusCode: 400 })
  })
})
