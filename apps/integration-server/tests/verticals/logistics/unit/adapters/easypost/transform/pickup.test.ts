import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/easypost/client', () => ({
  EasyPostClient: class {
    get = getMock
    post = postMock
  },
}))

import {
  transformPickup,
  cheapestPickupRate,
  type EasyPostPickup,
  type EasyPostPickupRate,
} from '../../../../../../../src/verticals/logistics/adapters/easypost/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import { EasyPostAdapter } from '../../../../../../../src/verticals/logistics/adapters/easypost'
import type {
  Credentials,
  PickupRequestParams,
} from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * EasyPost books a pickup in two calls: `POST /v2/pickups` quotes a
 * `pickup_rates[]` entry per carrier account (status "unknown", nothing
 * booked), then `POST /v2/pickups/:id/buy` on one of them by carrier +
 * service schedules it. The transform covers the record either call returns;
 * the adapter block below covers the two-step itself, which is where the
 * mistakes would be — buying the wrong quote, or a pickup with no quote at
 * all.
 */

// ─── Fixtures (docs.easypost.com/docs/pickups, "Create a Pickup" response) ───

function makeRate(overrides: Partial<EasyPostPickupRate> = {}): EasyPostPickupRate {
  return {
    id: 'pickuprate_df03ccc2da4e4825927464867c7f76b9',
    object: 'PickupRate',
    mode: 'test',
    service: 'NextDay',
    rate: '0.00',
    currency: 'USD',
    carrier: 'USPS',
    pickup_id: 'pickup_24f4406c58f24fde820759d84d9422fa',
    created_at: '2025-05-09T20:39:29Z',
    updated_at: '2025-05-09T20:39:29Z',
    ...overrides,
  }
}

function makePickup(overrides: Partial<EasyPostPickup> = {}): EasyPostPickup {
  return {
    id: 'pickup_24f4406c58f24fde820759d84d9422fa',
    object: 'Pickup',
    created_at: '2025-05-09T20:39:27Z',
    updated_at: '2025-05-09T20:39:27Z',
    mode: 'test',
    status: 'unknown',
    reference: 'my-first-pickup',
    min_datetime: '2025-05-12T00:00:00Z',
    max_datetime: '2025-05-12T17:00:00Z',
    is_account_address: false,
    instructions: 'Special pickup instructions',
    messages: [],
    confirmation: null,
    address: {
      id: 'adr_b379f0df2d1511f0ad1cac1f6bc539ae',
      object: 'Address',
      created_at: '2025-05-09T20:39:27+00:00',
      updated_at: '2025-05-09T20:39:27+00:00',
      name: 'Dr. Steve Brule',
      company: null,
      street1: '179 N Harbor Dr',
      street2: null,
      city: 'Redondo Beach',
      state: 'CA',
      zip: '90277',
      country: 'US',
      phone: '8573875756',
      email: 'dr_steve_brule@gmail.com',
      mode: 'test',
      carrier_facility: null,
      residential: null,
      verified: null,
      federal_tax_id: null,
      state_tax_id: null,
      verifications: {},
    },
    shipment: { id: 'shp_309a07be648b4df59ee7a85a2c2ed64f', object: 'Shipment' },
    carrier_accounts: [],
    pickup_rates: [makeRate()],
    ...overrides,
  }
}

/** The same record after `/buy` — status flips and the carrier confirmation lands. */
const bought = (): EasyPostPickup =>
  makePickup({
    status: 'scheduled',
    confirmation: 'WTC65095508',
    updated_at: '2025-05-09T20:39:41Z',
  })

// ─── Transform ───────────────────────────────────────────────────────────────

describe('easypost transformPickup', () => {
  it('maps the canonical fields off a bought pickup', () => {
    const p = transformPickup(bought())
    expect(p.id).toBe('pickup_24f4406c58f24fde820759d84d9422fa')
    expect(p.confirmationNumber).toBe('WTC65095508')
    expect(p.status).toBe('SCHEDULED')
    expect(p.instructions).toBe('Special pickup instructions')
    expect(p.readyAt).toEqual(new Date('2025-05-12T00:00:00Z'))
    expect(p.closeAt).toEqual(new Date('2025-05-12T17:00:00Z'))
    expect(p.createdAt).toEqual(new Date('2025-05-09T20:39:27Z'))
    expect(p.updatedAt).toEqual(new Date('2025-05-09T20:39:41Z'))
  })

  it('maps the pickup address through the shared EasyPost address transform', () => {
    const p = transformPickup(makePickup())
    expect(p.address).toEqual({
      name: 'Dr. Steve Brule',
      company: undefined,
      street1: '179 N Harbor Dr',
      street2: undefined,
      city: 'Redondo Beach',
      state: 'CA',
      postalCode: '90277',
      country: 'US',
      phone: '8573875756',
      email: 'dr_steve_brule@gmail.com',
    })
  })

  it('leaves the confirmation undefined before the pickup is bought', () => {
    // `confirmation` is null until /buy; null must not become "" or "null".
    expect(transformPickup(makePickup()).confirmationNumber).toBeUndefined()
  })

  describe('status map', () => {
    it.each([
      ['scheduled', 'SCHEDULED'],
      ['canceled', 'CANCELLED'],
      ['unknown', 'PENDING'],
    ])('%s → %s', (raw, canonical) => {
      expect(transformPickup(makePickup({ status: raw })).status).toBe(canonical)
    })

    it("EasyPost's 'unknown' is the quoted-not-booked state, hence PENDING", () => {
      // Every freshly created pickup is "unknown" until /buy; it is the normal
      // pre-booking state, not a value the map failed to recognise.
      expect(transformPickup(makePickup({ status: 'unknown' })).status).toBe('PENDING')
    })

    it("maps a status the docs do not list to canonical 'unknown'", () => {
      expect(transformPickup(makePickup({ status: 'completed' })).status).toBe('unknown')
    })
  })

  describe('carrierId', () => {
    it('is the carrier when every quote came from the same one', () => {
      const raw = makePickup({
        pickup_rates: [makeRate({ service: 'NextDay' }), makeRate({ service: 'SameDay' })],
      })
      expect(transformPickup(raw).carrierId).toBe('USPS')
    })

    it('stays undefined when several carriers quoted', () => {
      // A bought pickup carries no selected_rate, so the booked carrier is not
      // knowable from the record. Undefined, not a guess.
      const raw = makePickup({
        pickup_rates: [makeRate({ carrier: 'USPS' }), makeRate({ carrier: 'UPS' })],
      })
      expect(transformPickup(raw).carrierId).toBeUndefined()
    })

    it('stays undefined with no quotes at all', () => {
      expect(transformPickup(makePickup({ pickup_rates: [] })).carrierId).toBeUndefined()
    })
  })

  describe('shipmentIds', () => {
    it('carries the one shipment id', () => {
      expect(transformPickup(makePickup()).shipmentIds).toEqual([
        'shp_309a07be648b4df59ee7a85a2c2ed64f',
      ])
    })

    it('carries every shipment of a batch pickup', () => {
      const raw = makePickup({
        shipment: null,
        batch: {
          id: 'batch_b148b3715785487597be3f3c56f04884',
          shipments: [{ id: 'shp_1' }, { id: 'shp_2' }],
        },
      })
      expect(transformPickup(raw).shipmentIds).toEqual(['shp_1', 'shp_2'])
    })

    it('is undefined, not [], when the record names no shipment', () => {
      // The docs' own example responses omit `shipment` entirely.
      const raw = makePickup({ shipment: undefined })
      expect(transformPickup(raw).shipmentIds).toBeUndefined()
    })
  })

  it('preserves the raw payload by reference', () => {
    const raw = makePickup()
    expect(transformPickup(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(transformPickup(makePickup()))).not.toThrow()
    expect(() => PickupSchema.parse(transformPickup(bought()))).not.toThrow()
  })

  it('parses a sparse record too', () => {
    const sparse = {
      id: 'pickup_1',
      object: 'Pickup',
      status: 'canceled',
      address: null,
      pickup_rates: [],
    } as unknown as EasyPostPickup
    const out = transformPickup(sparse)
    expect(PickupSchema.safeParse(out).success).toBe(true)
    expect(out.address).toBeUndefined()
    expect(out.readyAt).toBeUndefined()
    expect(out.closeAt).toBeUndefined()
  })
})

// ─── Rate selection ──────────────────────────────────────────────────────────

describe('easypost cheapestPickupRate', () => {
  it('picks the lowest amount, comparing as decimals not strings', () => {
    // "10.00" < "9.25" as strings; as numbers 9.25 is the cheaper quote.
    const cheapest = cheapestPickupRate([
      makeRate({ id: 'r1', rate: '10.00' }),
      makeRate({ id: 'r2', rate: '9.25' }),
      makeRate({ id: 'r3', rate: '12.50' }),
    ])
    expect(cheapest?.id).toBe('r2')
  })

  it('keeps the first quote on a tie', () => {
    const cheapest = cheapestPickupRate([
      makeRate({ id: 'r1', rate: '0.00' }),
      makeRate({ id: 'r2', rate: '0.00' }),
    ])
    expect(cheapest?.id).toBe('r1')
  })

  it('skips a quote whose amount does not parse', () => {
    const cheapest = cheapestPickupRate([
      makeRate({ id: 'r1', rate: 'n/a' }),
      makeRate({ id: 'r2', rate: '3.00' }),
    ])
    expect(cheapest?.id).toBe('r2')
  })

  it('returns undefined with nothing to choose from', () => {
    expect(cheapestPickupRate([])).toBeUndefined()
    expect(cheapestPickupRate(undefined)).toBeUndefined()
    expect(cheapestPickupRate([makeRate({ rate: 'n/a' })])).toBeUndefined()
  })
})

// ─── Adapter: the create-then-buy two-step ───────────────────────────────────

const credentials = { accessToken: 'EZTK_test' } as Credentials
const adapter = new EasyPostAdapter()

function request(overrides: Partial<PickupRequestParams> = {}): PickupRequestParams {
  return {
    address: {
      name: 'Dr. Steve Brule',
      street1: '179 N Harbor Dr',
      city: 'Redondo Beach',
      state: 'CA',
      postalCode: '90277',
      country: 'US',
      phone: '8573875756',
    },
    readyAt: new Date('2025-05-12T00:00:00Z'),
    closeAt: new Date('2025-05-12T17:00:00Z'),
    shipmentIds: ['shp_309a07be648b4df59ee7a85a2c2ed64f'],
    instructions: 'Special pickup instructions',
    ...overrides,
  }
}

describe('EasyPostAdapter pickups', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('createPickup creates, then buys the cheapest quote by carrier + service', async () => {
    const quoted = makePickup({
      pickup_rates: [
        makeRate({ carrier: 'UPS', service: 'Same-Day Pickup', rate: '15.00' }),
        makeRate({ carrier: 'USPS', service: 'NextDay', rate: '0.00' }),
      ],
    })
    postMock.mockResolvedValueOnce(quoted).mockResolvedValueOnce(bought())

    const out = await adapter.createPickup(credentials, request())

    expect(postMock).toHaveBeenCalledTimes(2)
    const [createPath, createBody] = postMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(createPath).toBe('pickups')
    expect(createBody).toEqual({
      pickup: {
        reference: undefined,
        min_datetime: '2025-05-12T00:00:00.000Z',
        max_datetime: '2025-05-12T17:00:00.000Z',
        shipment: 'shp_309a07be648b4df59ee7a85a2c2ed64f',
        batch: undefined,
        address: {
          name: 'Dr. Steve Brule',
          company: undefined,
          street1: '179 N Harbor Dr',
          street2: undefined,
          city: 'Redondo Beach',
          state: 'CA',
          zip: '90277',
          country: 'US',
          phone: '8573875756',
          email: undefined,
        },
        carrier_accounts: undefined,
        instructions: 'Special pickup instructions',
      },
    })
    // The buy names the quote, not its id — and it is the USPS one at 0.00,
    // not the UPS one listed first.
    expect(postMock.mock.calls[1]).toEqual([
      'pickups/pickup_24f4406c58f24fde820759d84d9422fa/buy',
      { carrier: 'USPS', service: 'NextDay' },
    ])
    expect(out.status).toBe('SCHEDULED')
    expect(out.confirmationNumber).toBe('WTC65095508')
    expect(() => PickupSchema.parse(out)).not.toThrow()
  })

  it('createPickup narrows the quotes to `carrierId` as a carrier account', async () => {
    postMock.mockResolvedValueOnce(makePickup()).mockResolvedValueOnce(bought())
    await adapter.createPickup(credentials, request({ carrierId: 'ca_abc123' }))
    const body = postMock.mock.calls[0]![1] as { pickup: Record<string, unknown> }
    expect(body.pickup['carrier_accounts']).toEqual(['ca_abc123'])
  })

  it('createPickup schedules a batch when `batch` rides the index signature', async () => {
    postMock.mockResolvedValueOnce(makePickup()).mockResolvedValueOnce(bought())
    await adapter.createPickup(
      credentials,
      request({ shipmentIds: undefined, batch: 'batch_b148b3715785487597be3f3c56f04884' }),
    )
    const body = postMock.mock.calls[0]![1] as { pickup: Record<string, unknown> }
    expect(body.pickup['batch']).toBe('batch_b148b3715785487597be3f3c56f04884')
    expect(body.pickup['shipment']).toBeUndefined()
  })

  it('createPickup refuses a request with neither a shipment nor a batch, naming both keys', async () => {
    await expect(
      adapter.createPickup(credentials, request({ shipmentIds: undefined })),
    ).rejects.toThrow(/`shipmentIds`.*`batch`/)
    await expect(adapter.createPickup(credentials, request({ shipmentIds: [] }))).rejects.toThrow(
      /`shipmentIds`.*`batch`/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it('createPickup refuses several shipment ids rather than silently taking the first', async () => {
    await expect(
      adapter.createPickup(credentials, request({ shipmentIds: ['shp_1', 'shp_2'] })),
    ).rejects.toThrow(/one shipment or one batch, got 2 shipmentIds/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('createPickup fails on a pickup with no quote, surfacing the carrier errors', async () => {
    postMock.mockResolvedValueOnce(
      makePickup({
        pickup_rates: [],
        messages: [
          {
            carrier: 'USPS',
            type: 'rate_error',
            message: 'Pickup not available for this address',
            carrier_account_id: 'ca_abc123',
          },
        ],
      }),
    )
    await expect(adapter.createPickup(credentials, request())).rejects.toThrow(
      /no pickup_rates for pickup pickup_24f4406c58f24fde820759d84d9422fa — USPS: Pickup not available for this address/,
    )
    // No /buy attempted against a pickup that has nothing to buy.
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it('cancelPickup posts to /cancel and returns the carrier-side state', async () => {
    postMock.mockResolvedValueOnce(makePickup({ status: 'canceled', confirmation: 'WTC65095510' }))
    const out = await adapter.cancelPickup(credentials, 'pickup_24f4406c58f24fde820759d84d9422fa', {
      reason: 'ignored by EasyPost',
    })
    expect(postMock).toHaveBeenCalledWith(
      'pickups/pickup_24f4406c58f24fde820759d84d9422fa/cancel',
      {},
    )
    expect(out.status).toBe('CANCELLED')
    expect(() => PickupSchema.parse(out)).not.toThrow()
  })

  it('getPickup reads one pickup by id', async () => {
    getMock.mockResolvedValueOnce(bought())
    const out = await adapter.getPickup(credentials, 'pickup_24f4406c58f24fde820759d84d9422fa')
    expect(getMock).toHaveBeenCalledWith('pickups/pickup_24f4406c58f24fde820759d84d9422fa')
    expect(out.id).toBe('pickup_24f4406c58f24fde820759d84d9422fa')
  })

  it('listPickups unwraps the { pickups, has_more } envelope and pages with before_id', async () => {
    getMock.mockResolvedValueOnce({
      pickups: [bought(), makePickup({ id: 'pickup_older' })],
      has_more: true,
    })
    const out = await adapter.listPickups(credentials, { limit: 2, cursor: 'pickup_prev' })
    expect(getMock).toHaveBeenCalledWith('pickups', { page_size: 2, before_id: 'pickup_prev' })
    expect(out.map((p) => p.id)).toEqual([
      'pickup_24f4406c58f24fde820759d84d9422fa',
      'pickup_older',
    ])
    for (const p of out) expect(() => PickupSchema.parse(p)).not.toThrow()
  })

  it('listPickups sends no before_id on the first page', async () => {
    getMock.mockResolvedValueOnce({ pickups: [], has_more: false })
    expect(await adapter.listPickups(credentials, {})).toEqual([])
    expect(getMock).toHaveBeenCalledWith('pickups', { page_size: 20 })
  })
})
