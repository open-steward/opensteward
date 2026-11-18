import { describe, it, expect } from 'vitest'
import {
  buildPickupRequest,
  transformPickup,
  transformCancelledPickup,
  type USPSPickupConfirmation,
} from '../../../../../../../src/verticals/logistics/adapters/usps/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import type { PickupRequestParams } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * USPS Carrier Pickup v3 (carrier-pickup_7.yaml, 3.1.9). Both `POST
 * /carrier-pickup` and `GET /carrier-pickup/{confirmationNumber}` answer with
 * a PickupConfirmation that echoes the SchedulePickupRequest back under
 * `carrierPickupRequest`, and neither carries a status field. There is
 * therefore no status map to pin: a confirmation exists only while the pickup
 * is scheduled, `DELETE` removes it with an empty 200, and nothing upstream
 * can arrive unmapped.
 */

/** PickupConfirmation as the spec shapes it. */
function makeConfirmation(overrides: Partial<USPSPickupConfirmation> = {}): USPSPickupConfirmation {
  return {
    confirmationNumber: 'WTC123456789',
    pickupDate: '2026-01-15',
    carrierPickupRequest: {
      pickupDate: '2026-01-15',
      pickupAddress: {
        firstName: 'Jane',
        lastName: 'Doe',
        firm: 'Acme Industries',
        address: {
          streetAddress: '2500 MARKET ST',
          streetAddressAbbreviation: '2500 MARKET ST',
          secondaryAddress: 'STE 300',
          city: 'SAN FRANCISCO',
          cityAbbreviation: 'SAN FRANCISCO',
          state: 'CA',
          ZIPCode: '94114',
          ZIPPlus4: '1234',
          urbanization: null,
        },
        contact: [{ email: 'jane.doe@acme.example' }, { cellNumber: '4155550123' }],
      },
      packages: [{ packageType: 'PRIORITY_MAIL', packageCount: 2 }],
      estimatedWeight: 3.5,
      pickupLocation: {
        packageLocation: 'FRONT_DOOR',
        specialInstructions: 'Ring the bell at the loading dock.',
        dogPresent: false,
      },
      nextAvailablePickup: false,
    },
    ...overrides,
  }
}

function makeParams(overrides: Partial<PickupRequestParams> = {}): PickupRequestParams {
  return {
    address: {
      name: 'Jane Doe',
      company: 'Acme Industries',
      street1: '2500 Market Street',
      street2: 'Suite 300',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94114-1234',
      country: 'US',
      phone: '+14155550123',
      email: 'jane.doe@acme.example',
    },
    readyAt: new Date('2026-01-15T09:30:00Z'),
    packages: [{ weight: { value: 8, unit: 'oz' } }, { weight: { value: 3, unit: 'lb' } }],
    packageType: 'PRIORITY_MAIL',
    packageLocation: 'FRONT_DOOR',
    instructions: 'Ring the bell at the loading dock.',
    ...overrides,
  }
}

describe('usps transformPickup', () => {
  it('uses the confirmation number as both id and confirmationNumber', () => {
    const p = transformPickup(makeConfirmation())
    expect(p.id).toBe('WTC123456789')
    expect(p.confirmationNumber).toBe('WTC123456789')
    expect(p.carrierId).toBe('usps')
  })

  it('reports SCHEDULED, since USPS returns no status and only scheduled pickups exist', () => {
    expect(transformPickup(makeConfirmation()).status).toBe('SCHEDULED')
  })

  it('maps the echoed pickup address, joining first/last name and ZIP+4', () => {
    const a = transformPickup(makeConfirmation()).address
    expect(a).toEqual({
      name: 'Jane Doe',
      company: 'Acme Industries',
      street1: '2500 MARKET ST',
      street2: 'STE 300',
      city: 'SAN FRANCISCO',
      state: 'CA',
      postalCode: '94114-1234',
      phone: '4155550123',
      email: 'jane.doe@acme.example',
    })
  })

  it('leaves country undefined — Carrier Pickup is domestic and the response has no country', () => {
    expect(transformPickup(makeConfirmation()).address?.country).toBeUndefined()
  })

  it('joins a bare ZIP without a dangling hyphen', () => {
    const raw = makeConfirmation()
    raw.carrierPickupRequest!.pickupAddress.address.ZIPPlus4 = null
    expect(transformPickup(raw).address?.postalCode).toBe('94114')
  })

  it('reads readyAt from the top-level scheduled pickupDate', () => {
    // The top-level date is what USPS actually scheduled; the echoed
    // request's date is what was asked for, and they differ when
    // `nextAvailablePickup` rolled the pickup forward.
    const raw = makeConfirmation({ pickupDate: '2026-01-16' })
    expect(transformPickup(raw).readyAt).toEqual(new Date('2026-01-16'))
  })

  it('falls back to the echoed request pickupDate when the top-level one is absent', () => {
    const raw = makeConfirmation({ pickupDate: null })
    expect(transformPickup(raw).readyAt).toEqual(new Date('2026-01-15'))
  })

  it('surfaces specialInstructions as instructions', () => {
    expect(transformPickup(makeConfirmation()).instructions).toBe(
      'Ring the bell at the loading dock.',
    )
  })

  it('has no closeAt or shipmentIds — a USPS pickup is a date, scheduled by mail-class counts', () => {
    const p = transformPickup(makeConfirmation())
    expect(p.closeAt).toBeUndefined()
    expect(p.shipmentIds).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeConfirmation()
    expect(transformPickup(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(transformPickup(makeConfirmation()))).not.toThrow()
  })

  it('parses a sparse confirmation too', () => {
    const sparse = { confirmationNumber: 'WTC1', pickupDate: null, carrierPickupRequest: null }
    const p = transformPickup(sparse)
    expect(p.address).toBeUndefined()
    expect(p.readyAt).toBeUndefined()
    expect(PickupSchema.safeParse(p).success).toBe(true)
  })
})

describe('usps transformCancelledPickup', () => {
  it('synthesises a CANCELLED record from the id, since DELETE returns no body', () => {
    const p = transformCancelledPickup('WTC123456789', { reason: 'no longer needed' })
    expect(p.id).toBe('WTC123456789')
    expect(p.confirmationNumber).toBe('WTC123456789')
    expect(p.carrierId).toBe('usps')
    expect(p.status).toBe('CANCELLED')
  })

  it('keeps the cancel request as metadata by reference', () => {
    const data = { reason: 'no longer needed' }
    expect(transformCancelledPickup('WTC1', data).metadata).toBe(data)
  })

  it('produces output the canonical schema accepts, with and without a body', () => {
    expect(() =>
      PickupSchema.parse(transformCancelledPickup('WTC1', { reason: 'x' })),
    ).not.toThrow()
    expect(() => PickupSchema.parse(transformCancelledPickup('WTC1'))).not.toThrow()
  })
})

describe('usps buildPickupRequest', () => {
  it('builds a SchedulePickupRequest with exactly the spec keys', () => {
    const body = buildPickupRequest(makeParams())
    expect(body).toEqual({
      pickupDate: '2026-01-15',
      pickupAddress: {
        firstName: 'Jane',
        lastName: 'Doe',
        firm: 'Acme Industries',
        address: {
          streetAddress: '2500 Market Street',
          secondaryAddress: 'Suite 300',
          city: 'San Francisco',
          state: 'CA',
          ZIPCode: '94114',
          ZIPPlus4: '1234',
        },
        contact: [{ email: 'jane.doe@acme.example' }, { cellNumber: '4155550123' }],
      },
      packages: [{ packageType: 'PRIORITY_MAIL', packageCount: 2 }],
      estimatedWeight: 3.5,
      pickupLocation: {
        packageLocation: 'FRONT_DOOR',
        specialInstructions: 'Ring the bell at the loading dock.',
        dogPresent: undefined,
      },
      nextAvailablePickup: undefined,
    })
  })

  it('takes pickupDate as the UTC calendar date of readyAt', () => {
    const body = buildPickupRequest(makeParams({ readyAt: new Date('2026-03-02T23:59:59Z') }))
    expect(body.pickupDate).toBe('2026-03-02')
  })

  it('splits the name on the last whitespace so compound given names survive', () => {
    const body = buildPickupRequest(
      makeParams({ address: { ...makeParams().address, name: '  Mary Anne  Smith ' } }),
    )
    expect(body.pickupAddress.firstName).toBe('Mary Anne')
    expect(body.pickupAddress.lastName).toBe('Smith')
  })

  it('throws naming address.name when there is no surname to split off', () => {
    // Addressee requires firstName AND lastName; USPS would 400 anyway, so say why up front.
    expect(() =>
      buildPickupRequest(makeParams({ address: { ...makeParams().address, name: 'Cher' } })),
    ).toThrow('address.name')
  })

  it('sends a bare ZIP as ZIPCode with no ZIPPlus4', () => {
    const body = buildPickupRequest(
      makeParams({ address: { ...makeParams().address, postalCode: '94114' } }),
    )
    expect(body.pickupAddress.address.ZIPCode).toBe('94114')
    expect(body.pickupAddress.address.ZIPPlus4).toBeUndefined()
  })

  it('normalises the phone to ten digits for the SMS contact', () => {
    const body = buildPickupRequest(
      makeParams({ address: { ...makeParams().address, phone: '(415) 555-0123' } }),
    )
    expect(body.pickupAddress.contact).toContainEqual({ cellNumber: '4155550123' })
  })

  it('omits a phone that does not reduce to ten digits rather than failing the request', () => {
    const body = buildPickupRequest(
      makeParams({ address: { ...makeParams().address, phone: '+44 20 7946 0958' } }),
    )
    expect(body.pickupAddress.contact).toEqual([{ email: 'jane.doe@acme.example' }])
  })

  it('throws naming email/phone when no contact method survives', () => {
    expect(() =>
      buildPickupRequest(
        makeParams({ address: { ...makeParams().address, phone: undefined, email: undefined } }),
      ),
    ).toThrow('address.email')
  })

  it('throws naming packageType, which the canonical package cannot carry', () => {
    expect(() => buildPickupRequest(makeParams({ packageType: undefined }))).toThrow('packageType')
  })

  it('throws when there are no packages to count', () => {
    expect(() => buildPickupRequest(makeParams({ packages: [] }))).toThrow('packages')
    expect(() => buildPickupRequest(makeParams({ packages: undefined }))).toThrow('packages')
  })

  it('sums package weights into pounds', () => {
    const body = buildPickupRequest(
      makeParams({
        packages: [
          { weight: { value: 16, unit: 'oz' } },
          { weight: { value: 1, unit: 'kg' } },
          { weight: { value: 500, unit: 'g' } },
        ],
      }),
    )
    expect(body.estimatedWeight).toBe(4.31)
    expect(body.packages).toEqual([{ packageType: 'PRIORITY_MAIL', packageCount: 3 }])
  })

  it('falls back to an explicit estimatedWeight when a package has no weight', () => {
    const body = buildPickupRequest(
      makeParams({ packages: [{}, { weight: { value: 1, unit: 'lb' } }], estimatedWeight: 2.5 }),
    )
    expect(body.estimatedWeight).toBe(2.5)
  })

  it('throws naming estimatedWeight when neither weights nor an override are given', () => {
    expect(() => buildPickupRequest(makeParams({ packages: [{}] }))).toThrow('estimatedWeight')
  })

  it('derives packageLocation OTHER from instructions when none is given', () => {
    // The spec makes `specialInstructions` the description of the OTHER
    // location, so free text alone is a complete pickupLocation.
    const body = buildPickupRequest(makeParams({ packageLocation: undefined }))
    expect(body.pickupLocation).toEqual({
      packageLocation: 'OTHER',
      specialInstructions: 'Ring the bell at the loading dock.',
      dogPresent: undefined,
    })
  })

  it('throws naming packageLocation when neither a location nor instructions are given', () => {
    expect(() =>
      buildPickupRequest(makeParams({ packageLocation: undefined, instructions: undefined })),
    ).toThrow('packageLocation')
  })

  it('passes dogPresent and nextAvailablePickup through when given as booleans', () => {
    const body = buildPickupRequest(makeParams({ dogPresent: true, nextAvailablePickup: true }))
    expect(body.pickupLocation.dogPresent).toBe(true)
    expect(body.nextAvailablePickup).toBe(true)
  })

  it('does not send closeAt, carrierId or shipmentIds — USPS has no field for them', () => {
    const body = buildPickupRequest(
      makeParams({
        closeAt: new Date('2026-01-15T17:00:00Z'),
        carrierId: 'usps',
        shipmentIds: ['9400100000000000000000'],
      }),
    ) as unknown as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'estimatedWeight',
      'nextAvailablePickup',
      'packages',
      'pickupAddress',
      'pickupDate',
      'pickupLocation',
    ])
  })
})
