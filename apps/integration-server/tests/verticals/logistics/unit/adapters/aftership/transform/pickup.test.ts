import { describe, it, expect } from 'vitest'
import {
  transformPickup,
  toPickupRequest,
  type AfterShipPickup,
} from '../../../../../../../src/verticals/logistics/adapters/aftership/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import type { PickupRequestParams } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * Fixture is the `POST /pickups` 200 example from the AfterShip Shipping v3
 * OpenAPI document (`shipping-v3.json`), ids made distinguishable. Note what
 * the vendor gives us: `country` in alpha-3, a window as a bare date plus two
 * wall-clock times with no offset, and confirmation numbers as an array.
 */
function makePickup(overrides: Partial<AfterShipPickup> = {}): AfterShipPickup {
  return {
    id: 'a3f1c2d4-5e6b-4c7d-8e9f-0a1b2c3d4e5f',
    status: 'created',
    pickup_confirmation_numbers: ['3012'],
    pickup_date: '2023-09-21',
    pickup_start_time: '09:00:00',
    pickup_end_time: '18:00:00',
    pickup_from: {
      contact_name: 'AfterShip Shipping',
      company_name: 'AfterShip Shipping',
      street1: '230 W 200 S LBBY',
      city: 'Salt Lake City',
      state: 'UT',
      postal_code: '84101',
      country: 'USA',
      phone: '123456789',
      email: 'test@test.com',
    },
    ship_to: null,
    label_ids: ['7d0e9b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b'],
    shipper_account: { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', slug: 'fedex' },
    pickup_parcels: [{ weight: { value: 1, unit: 'lb' }, quantity: 1 }],
    created_at: '2023-09-21T07:54:13.024Z',
    updated_at: '2023-09-21T07:54:13.024Z',
    ...overrides,
  }
}

describe('aftership transformPickup', () => {
  it('maps id, confirmation number, carrier and status', () => {
    const p = transformPickup(makePickup())
    expect(p.id).toBe('a3f1c2d4-5e6b-4c7d-8e9f-0a1b2c3d4e5f')
    expect(p.confirmationNumber).toBe('3012')
    expect(p.carrierId).toBe('fedex')
    expect(p.status).toBe('SCHEDULED')
  })

  it('takes the first confirmation number and leaves the rest on metadata', () => {
    // The canonical field is a single string; AfterShip's is an array.
    const raw = makePickup({ pickup_confirmation_numbers: ['3012', '3013'] })
    const p = transformPickup(raw)
    expect(p.confirmationNumber).toBe('3012')
    expect(p.metadata?.pickup_confirmation_numbers).toEqual(['3012', '3013'])
  })

  it('has no confirmation number before the carrier has dispatched one', () => {
    expect(
      transformPickup(makePickup({ pickup_confirmation_numbers: [] })).confirmationNumber,
    ).toBeUndefined()
    expect(
      transformPickup(makePickup({ pickup_confirmation_numbers: null })).confirmationNumber,
    ).toBeUndefined()
  })

  it('maps the collection address from pickup_from', () => {
    const a = transformPickup(makePickup()).address
    expect(a).toMatchObject({
      name: 'AfterShip Shipping',
      company: 'AfterShip Shipping',
      street1: '230 W 200 S LBBY',
      city: 'Salt Lake City',
      state: 'UT',
      postalCode: '84101',
      phone: '123456789',
      email: 'test@test.com',
    })
  })

  it('does not map country, because AfterShip uses alpha-3 and the schema rejects it', () => {
    const p = transformPickup(makePickup())
    expect(p.address?.country).toBeUndefined()
    // The reason, pinned: had it been copied across, the record would not parse.
    const copied = { ...p, address: { ...p.address, country: 'USA' } }
    expect(PickupSchema.safeParse(copied).success).toBe(false)
    // …and the value is still there for a caller who can read alpha-3.
    expect((p.metadata?.pickup_from as { country: string }).country).toBe('USA')
  })

  it('leaves address undefined when pickup_from is absent', () => {
    expect(transformPickup(makePickup({ pickup_from: null })).address).toBeUndefined()
  })

  it('reads the pickup window as UTC wall-clock', () => {
    // `2023-09-21` + `09:00:00` carries no offset. Reading it as UTC is the
    // one choice that gives the same instant on every machine.
    const p = transformPickup(makePickup())
    expect(p.readyAt).toEqual(new Date('2023-09-21T09:00:00Z'))
    expect(p.closeAt).toEqual(new Date('2023-09-21T18:00:00Z'))
  })

  it('falls back to the bare date for readyAt, never for closeAt', () => {
    const p = transformPickup(makePickup({ pickup_start_time: null, pickup_end_time: null }))
    expect(p.readyAt).toEqual(new Date('2023-09-21'))
    expect(p.closeAt).toBeUndefined()
  })

  it('has no window at all without a pickup_date', () => {
    const p = transformPickup(makePickup({ pickup_date: null }))
    expect(p.readyAt).toBeUndefined()
    expect(p.closeAt).toBeUndefined()
  })

  it('carries label ids as shipmentIds', () => {
    expect(transformPickup(makePickup()).shipmentIds).toEqual([
      '7d0e9b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b',
    ])
    expect(transformPickup(makePickup({ label_ids: null })).shipmentIds).toBeUndefined()
  })

  it('parses created_at and updated_at', () => {
    const p = transformPickup(makePickup())
    expect(p.createdAt).toEqual(new Date('2023-09-21T07:54:13.024Z'))
    expect(p.updatedAt).toEqual(new Date('2023-09-21T07:54:13.024Z'))
  })

  it('leaves carrierId undefined when shipper_account has no slug', () => {
    // The model documents `shipper_account` as `{ id }`; the slug is what the
    // examples actually carry. Never substitute the account id for a carrier.
    const p = transformPickup(makePickup({ shipper_account: { id: 'acct_1' } }))
    expect(p.carrierId).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makePickup()
    expect(transformPickup(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(transformPickup(makePickup()))).not.toThrow()
  })

  it('parses a sparse pickup too', () => {
    const sparse = { id: 'p_1', status: 'creating' } as AfterShipPickup
    expect(PickupSchema.safeParse(transformPickup(sparse)).success).toBe(true)
  })
})

describe('aftership pickup status map', () => {
  it.each([
    ['creating', 'PENDING'],
    ['created', 'SCHEDULED'],
    ['failed', 'FAILED'],
    ['cancelled', 'CANCELLED'],
  ])('maps %s to %s', (raw, canonical) => {
    expect(transformPickup(makePickup({ status: raw })).status).toBe(canonical)
  })

  it('maps cancelling to unknown, because the cancel can still fail', () => {
    expect(transformPickup(makePickup({ status: 'cancelling' })).status).toBe('unknown')
  })

  it('maps an unrecognised status to unknown', () => {
    expect(transformPickup(makePickup({ status: 'teleporting' })).status).toBe('unknown')
  })
})

/** A canonical request that satisfies every AfterShip rule, to be broken one at a time. */
function makeRequest(overrides: Partial<PickupRequestParams> = {}): PickupRequestParams {
  return {
    address: {
      name: 'Jane Doe',
      company: 'Acme Industries',
      street1: '2500 Market Street',
      street2: 'Suite 300',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94114',
      country: 'USA',
      phone: '+14155550123',
      email: 'jane.doe@acme.example',
    },
    readyAt: new Date('2026-01-15T09:30:00Z'),
    closeAt: new Date('2026-01-15T17:00:00Z'),
    shipmentIds: ['lbl_1', 'lbl_2'],
    instructions: 'Ring the bell at the loading dock.',
    ...overrides,
  }
}

describe('aftership toPickupRequest', () => {
  it('splits the window into a date and two UTC wall-clock times', () => {
    const body = toPickupRequest(makeRequest())
    expect(body.pickup_date).toBe('2026-01-15')
    expect(body.pickup_start_time).toBe('09:30:00')
    expect(body.pickup_end_time).toBe('17:00:00')
  })

  it('round-trips through transformPickup without drifting', () => {
    // The write side and the read side agree on the UTC reading, so what a
    // caller schedules is what they read back.
    const body = toPickupRequest(makeRequest())
    const echoed = transformPickup({
      id: 'p_1',
      status: 'created',
      pickup_date: body.pickup_date,
      pickup_start_time: body.pickup_start_time,
      pickup_end_time: body.pickup_end_time,
    })
    expect(echoed.readyAt).toEqual(new Date('2026-01-15T09:30:00Z'))
    expect(echoed.closeAt).toEqual(new Date('2026-01-15T17:00:00Z'))
  })

  it('maps the address to pickup_from with AfterShip field names', () => {
    expect(toPickupRequest(makeRequest()).pickup_from).toEqual({
      contact_name: 'Jane Doe',
      company_name: 'Acme Industries',
      street1: '2500 Market Street',
      street2: 'Suite 300',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94114',
      country: 'USA',
      phone: '+14155550123',
      email: 'jane.doe@acme.example',
    })
  })

  it('sends shipment ids as label_ids, with no parcels', () => {
    const body = toPickupRequest(makeRequest())
    expect(body.label_ids).toEqual(['lbl_1', 'lbl_2'])
    expect(body.pickup_parcels).toBeUndefined()
    // No shipper account was given and none is needed: the labels name it.
    expect(body.shipper_account).toBeUndefined()
  })

  it('passes instructions and the optional pickup_location through', () => {
    const body = toPickupRequest(makeRequest({ pickupLocation: 'FrontDoor' }))
    expect(body.pickup_instructions).toBe('Ring the bell at the loading dock.')
    expect(body.pickup_location).toBe('FrontDoor')
  })

  it('maps packages to pickup_parcels, one parcel each, depth from length', () => {
    const body = toPickupRequest(
      makeRequest({
        shipmentIds: undefined,
        shipperAccountId: 'acct_1',
        serviceType: 'ups_ground',
        packages: [
          {
            weight: { value: 1.2, unit: 'lb' },
            dimensions: { length: 12, width: 6, height: 2, unit: 'in' },
          },
          { weight: { value: 500, unit: 'g' } },
        ],
      }),
    )
    expect(body.label_ids).toBeUndefined()
    expect(body.shipper_account).toEqual({ id: 'acct_1' })
    expect(body.pickup_parcels).toEqual([
      {
        weight: { unit: 'lb', value: 1.2 },
        quantity: 1,
        service_type: 'ups_ground',
        dimension: { width: 6, height: 2, depth: 12, unit: 'in' },
      },
      {
        weight: { unit: 'g', value: 500 },
        quantity: 1,
        service_type: 'ups_ground',
        dimension: undefined,
      },
    ])
  })

  it('refuses a request without closeAt rather than inventing a closing time', () => {
    expect(() => toPickupRequest(makeRequest({ closeAt: undefined }))).toThrow(/closeAt/)
  })

  it('refuses an alpha-2 country, naming what AfterShip wants instead', () => {
    const req = makeRequest()
    expect(() => toPickupRequest({ ...req, address: { ...req.address, country: 'US' } })).toThrow(
      /alpha-3.*"US"/,
    )
    expect(() =>
      toPickupRequest({ ...req, address: { ...req.address, country: undefined } }),
    ).toThrow(/alpha-3/)
  })

  it('refuses a request with neither labels nor packages', () => {
    expect(() => toPickupRequest(makeRequest({ shipmentIds: [] }))).toThrow(/shipmentIds.*packages/)
  })

  it('refuses a request with both labels and packages', () => {
    expect(() =>
      toPickupRequest(
        makeRequest({
          shipperAccountId: 'acct_1',
          packages: [{ weight: { value: 1, unit: 'lb' } }],
        }),
      ),
    ).toThrow(/not both/)
  })

  it('refuses a parcel pickup without a shipper account', () => {
    expect(() =>
      toPickupRequest(
        makeRequest({ shipmentIds: undefined, packages: [{ weight: { value: 1, unit: 'lb' } }] }),
      ),
    ).toThrow(/shipperAccountId/)
  })

  it('refuses a package without a weight, naming its index', () => {
    expect(() =>
      toPickupRequest(
        makeRequest({
          shipmentIds: undefined,
          shipperAccountId: 'acct_1',
          packages: [{ weight: { value: 1, unit: 'lb' } }, { id: 'pkg_2' }],
        }),
      ),
    ).toThrow(/packages\[1\]\.weight/)
  })
})
