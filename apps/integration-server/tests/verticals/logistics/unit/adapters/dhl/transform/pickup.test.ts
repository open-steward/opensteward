import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  transformPickup,
  cancelledPickup,
  toDHLPartyDetails,
  toDHLPickupDateTime,
  toDHLCloseTime,
  toDHLPickupPackages,
  toDHLShipmentDetails,
  type DHLPickupResponse,
} from '../../../../../../../src/verticals/logistics/adapters/dhl/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import { DHLAdapter } from '../../../../../../../src/verticals/logistics/adapters/dhl'
import type { PickupRequestParams } from '../../../../../../../src/verticals/logistics/adapter/interface'

const { postMock, deleteMock } = vi.hoisted(() => ({ postMock: vi.fn(), deleteMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/dhl/client', () => ({
  DHLClient: class {
    post = postMock
    delete = deleteMock
  },
}))

/**
 * MyDHL API's `POST /pickups` answers 201 with a list of dispatch confirmation
 * numbers and, at most, a next-pickup date and a ready-by time. No status, no
 * echo of the address or window. The cancel (`DELETE /pickups/{n}`) answers
 * 200 with no body at all, and there is no GET to re-read a booking from.
 */

/**
 * The spec's `nonDocRequestPickupResponse` example, plus the two optional
 * echo fields at their documented example values.
 */
function makeResponse(overrides: Partial<DHLPickupResponse> = {}): DHLPickupResponse {
  return {
    dispatchConfirmationNumbers: ['PRG221222000062'],
    readyByTime: '12:00',
    nextPickupDate: '2020-06-01',
    ...overrides,
  }
}

function makeParams(overrides: Partial<PickupRequestParams> = {}): PickupRequestParams {
  return {
    address: {
      name: 'Adam Spencer',
      company: 'Company Name',
      street1: '498 Bromford Gate',
      street2: 'Bromford Lane',
      city: 'BIRMINGHAM',
      postalCode: 'B24 8DW',
      country: 'GB',
      phone: '+1123456789',
      email: 'that@before.gb',
    },
    readyAt: new Date('2026-01-15T09:30:00Z'),
    closeAt: new Date('2026-01-15T17:00:00Z'),
    instructions: 'please ring front desk',
    accountNumber: '123456789',
    serviceCode: 'P',
    packages: [
      {
        weight: { value: 10.5, unit: 'kg' },
        dimensions: { length: 25, width: 35, height: 15, unit: 'cm' },
      },
    ],
    ...overrides,
  }
}

describe('dhl transformPickup', () => {
  it('takes the dispatch confirmation number as both id and confirmationNumber', () => {
    const p = transformPickup(makeResponse())
    expect(p.id).toBe('PRG221222000062')
    expect(p.confirmationNumber).toBe('PRG221222000062')
    expect(p.carrierId).toBe('dhl')
  })

  it('keeps the first number when a request is consolidated into several dispatches', () => {
    // `dispatchConfirmationNumbers` is an array (maxItems 999). The record is
    // keyed on the first; the rest stay reachable through metadata.
    const raw = makeResponse({
      dispatchConfirmationNumbers: ['CBJ220603000389', 'CBJ220603000390'],
    })
    const p = transformPickup(raw)
    expect(p.id).toBe('CBJ220603000389')
    expect(p.metadata?.dispatchConfirmationNumbers).toEqual(['CBJ220603000389', 'CBJ220603000390'])
  })

  it('throws when DHL returns no dispatch confirmation number', () => {
    // `id` is REQUIRED on Pickup and the number is the only identity DHL
    // issues, so an empty list is a failed booking, not a record.
    expect(() => transformPickup(makeResponse({ dispatchConfirmationNumbers: [] }))).toThrow(
      /dispatchConfirmationNumber/,
    )
    const noKey = { readyByTime: '12:00' } as unknown as DHLPickupResponse
    expect(() => transformPickup(noKey)).toThrow(/dispatchConfirmationNumber/)
  })

  it('reads readyAt from nextPickupDate + readyByTime in the clock the adapter booked in', () => {
    // The adapter sends plannedPickupDateAndTime as GMT+00:00, and DHL echoes
    // the ready-by time with no offset — so it is read back as UTC, tagged
    // explicitly. The assertion is on the instant, which a host-local parse
    // would move by the host's offset.
    const p = transformPickup(makeResponse())
    expect(p.readyAt?.toISOString()).toBe('2020-06-01T12:00:00.000Z')
  })

  it('accepts a seconds-precision readyByTime too', () => {
    const p = transformPickup(makeResponse({ readyByTime: '12:00:30' }))
    expect(p.readyAt?.toISOString()).toBe('2020-06-01T12:00:30.000Z')
  })

  it('leaves readyAt undefined when either half of the timestamp is missing', () => {
    // A date alone is not an instant; it is not promoted to midnight.
    expect(transformPickup(makeResponse({ readyByTime: null })).readyAt).toBeUndefined()
    expect(transformPickup(makeResponse({ nextPickupDate: undefined })).readyAt).toBeUndefined()
    expect(transformPickup(makeResponse({ readyByTime: 'noon' })).readyAt).toBeUndefined()
  })

  it('does not fabricate what the response does not carry', () => {
    const p = transformPickup(makeResponse())
    expect(p.address).toBeUndefined()
    expect(p.closeAt).toBeUndefined()
    expect(p.shipmentIds).toBeUndefined()
    expect(p.instructions).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeResponse({ warnings: ['Pickup created but something went wrong'] })
    expect(transformPickup(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(transformPickup(makeResponse()))).not.toThrow()
  })

  it('parses a numbers-only response too', () => {
    const sparse = { dispatchConfirmationNumbers: ['PRG221222000062'] } as DHLPickupResponse
    expect(PickupSchema.safeParse(transformPickup(sparse)).success).toBe(true)
  })
})

describe('dhl pickup status', () => {
  // DHL reports no status field on either call, so there is no upstream
  // enum to map and no value that could land on 'unknown'. Status follows
  // the call that produced the record: a 201 carrying a number is a
  // booking, a 200 on DELETE is a cancellation.
  it('a booked pickup is SCHEDULED', () => {
    expect(transformPickup(makeResponse()).status).toBe('SCHEDULED')
  })

  it('a booking with warnings is still SCHEDULED — the number was issued', () => {
    const raw = makeResponse({ warnings: ['Pickup created but something went wrong'] })
    expect(transformPickup(raw).status).toBe('SCHEDULED')
  })

  it('a cancelled pickup is CANCELLED', () => {
    expect(cancelledPickup('PRG221222000062').status).toBe('CANCELLED')
  })
})

describe('dhl cancelledPickup', () => {
  it('is keyed on the dispatch confirmation number it cancelled', () => {
    const p = cancelledPickup('PRG211126000382')
    expect(p.id).toBe('PRG211126000382')
    expect(p.confirmationNumber).toBe('PRG211126000382')
    expect(p.carrierId).toBe('dhl')
  })

  it('carries no metadata, because DELETE returns no body', () => {
    expect(cancelledPickup('PRG211126000382').metadata).toBeUndefined()
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(cancelledPickup('PRG211126000382'))).not.toThrow()
  })
})

describe('dhl pickup request builders', () => {
  it('writes plannedPickupDateAndTime as UTC with the offset spelled out', () => {
    // Format per spec: YYYY-MM-DDTHH:MM:SS GMT+HH:MM, maxLength 29.
    const s = toDHLPickupDateTime(new Date('2026-01-15T09:30:00Z'))
    expect(s).toBe('2026-01-15T09:30:00 GMT+00:00')
    expect(s.length).toBeLessThanOrEqual(29)
  })

  it('is the same instant however the caller spelled it', () => {
    // A Date built from an offset string is the same instant; the DHL string
    // must not depend on the host TZ either.
    expect(toDHLPickupDateTime(new Date('2026-01-15T04:30:00-05:00'))).toBe(
      '2026-01-15T09:30:00 GMT+00:00',
    )
  })

  it('writes closeTime as HH:MM in that same clock', () => {
    expect(toDHLCloseTime(new Date('2026-01-15T17:00:00Z'))).toBe('17:00')
  })

  it('maps the canonical address onto postalAddress + contactInformation', () => {
    const d = toDHLPartyDetails(makeParams().address)
    expect(d.postalAddress).toEqual({
      addressLine1: '498 Bromford Gate',
      addressLine2: 'Bromford Lane',
      cityName: 'BIRMINGHAM',
      provinceCode: undefined,
      postalCode: 'B24 8DW',
      countryCode: 'GB',
    })
    expect(d.contactInformation).toEqual({
      fullName: 'Adam Spencer',
      companyName: 'Company Name',
      phone: '+1123456789',
      email: 'that@before.gb',
    })
  })

  it('falls back to the contact name for companyName, which DHL requires', () => {
    const d = toDHLPartyDetails({ name: 'Adam Spencer', street1: '1 Main St' })
    expect(d.contactInformation.companyName).toBe('Adam Spencer')
  })

  it('sends metric packages through in kg / cm', () => {
    const out = toDHLPickupPackages(makeParams().packages!)
    expect(out.unitOfMeasurement).toBe('metric')
    expect(out.packages).toEqual([
      { weight: 10.5, dimensions: { length: 25, width: 35, height: 15 } },
    ])
  })

  it('converts grams into the metric system rather than relabelling them', () => {
    const out = toDHLPickupPackages([{ weight: { value: 750, unit: 'g' } }])
    expect(out.packages[0]).toEqual({ weight: 0.75, dimensions: undefined })
  })

  it('follows the first package into imperial and converts ounces to pounds', () => {
    const out = toDHLPickupPackages([
      { weight: { value: 2, unit: 'lb' } },
      { weight: { value: 8, unit: 'oz' } },
    ])
    expect(out.unitOfMeasurement).toBe('imperial')
    expect(out.packages.map((p) => p.weight)).toEqual([2, 0.5])
  })

  it('converts dimensions into whichever system the weight chose', () => {
    const metric = toDHLPickupPackages([
      {
        weight: { value: 1, unit: 'kg' },
        dimensions: { length: 10, width: 10, height: 10, unit: 'in' },
      },
    ])
    expect(metric.packages[0].dimensions).toEqual({ length: 25.4, width: 25.4, height: 25.4 })
    const imperial = toDHLPickupPackages([
      {
        weight: { value: 1, unit: 'lb' },
        dimensions: { length: 25.4, width: 2.54, height: 254, unit: 'cm' },
      },
    ])
    expect(imperial.packages[0].dimensions).toEqual({ length: 10, width: 1, height: 100 })
  })

  it('throws naming the package that has no weight', () => {
    // Every DHL package needs a weight (minimum 0.001); nothing is invented.
    expect(() =>
      toDHLPickupPackages([{ weight: { value: 1, unit: 'kg' } }, { reference: 'no-weight' }]),
    ).toThrow(/packages\[1\]\.weight/)
  })

  it('assembles one shipmentDetails entry from the canonical fields', () => {
    const [entry] = toDHLShipmentDetails(
      makeParams({ shipmentIds: ['1234567890'] }),
      '123456789',
    ) as Record<string, unknown>[]
    expect(entry).toEqual({
      productCode: 'P',
      accounts: [{ typeCode: 'shipper', number: '123456789' }],
      isCustomsDeclarable: false,
      shipmentTrackingNumber: '1234567890',
      unitOfMeasurement: 'metric',
      packages: [{ weight: 10.5, dimensions: { length: 25, width: 35, height: 15 } }],
    })
  })

  it('honours an explicit isCustomsDeclarable', () => {
    const [entry] = toDHLShipmentDetails(
      makeParams({ isCustomsDeclarable: true }),
      '123456789',
    ) as Record<string, unknown>[]
    expect(entry.isCustomsDeclarable).toBe(true)
  })

  it('passes a caller-supplied shipmentDetails[] through verbatim', () => {
    const theirs = [
      { productCode: 'P', isCustomsDeclarable: false, unitOfMeasurement: 'metric', packages: [] },
    ]
    expect(
      toDHLShipmentDetails(makeParams({ shipmentDetails: theirs, packages: undefined }), '1'),
    ).toBe(theirs)
  })

  it('throws naming the index-signature key it cannot do without', () => {
    expect(() => toDHLShipmentDetails(makeParams({ serviceCode: undefined }), '1')).toThrow(
      /serviceCode/,
    )
    expect(() => toDHLShipmentDetails(makeParams({ packages: [] }), '1')).toThrow(/package/)
    expect(() => toDHLShipmentDetails(makeParams({ shipmentIds: ['a', 'b'] }), '1')).toThrow(
      /shipmentDetails/,
    )
  })
})

describe('DHLAdapter pickups (client mocked)', () => {
  const creds = { accessToken: 'apiKey:apiSecret' }
  const adapter = new DHLAdapter()

  beforeEach(() => {
    postMock.mockReset()
    deleteMock.mockReset()
  })

  it('books through POST /pickups with the assembled body and returns the record', async () => {
    postMock.mockResolvedValue(makeResponse())
    const p = await adapter.createPickup(
      creds,
      makeParams({ location: 'reception', locationType: 'business' }),
    )

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('pickups')
    expect(body).toMatchObject({
      plannedPickupDateAndTime: '2026-01-15T09:30:00 GMT+00:00',
      closeTime: '17:00',
      location: 'reception',
      locationType: 'business',
      accounts: [{ typeCode: 'shipper', number: '123456789' }],
      specialInstructions: [{ value: 'please ring front desk' }],
      customerDetails: {
        shipperDetails: {
          postalAddress: {
            addressLine1: '498 Bromford Gate',
            cityName: 'BIRMINGHAM',
            countryCode: 'GB',
          },
          contactInformation: { fullName: 'Adam Spencer', companyName: 'Company Name' },
        },
      },
      shipmentDetails: [{ productCode: 'P', unitOfMeasurement: 'metric' }],
    })
    expect(p.id).toBe('PRG221222000062')
    expect(p.status).toBe('SCHEDULED')
  })

  it('omits closeTime and specialInstructions when the caller gave none', async () => {
    postMock.mockResolvedValue(makeResponse())
    await adapter.createPickup(creds, makeParams({ closeAt: undefined, instructions: undefined }))
    const [, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.closeTime).toBeUndefined()
    expect(body.specialInstructions).toBeUndefined()
  })

  it('refuses to book without accountNumber, before any request goes out', async () => {
    await expect(
      adapter.createPickup(creds, makeParams({ accountNumber: undefined })),
    ).rejects.toThrow(/accountNumber/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('cancels through DELETE /pickups/{n} with requestorName and reason as query params', async () => {
    deleteMock.mockResolvedValue(undefined)
    const p = await adapter.cancelPickup(creds, 'PRG211126000382', {
      requestorName: 'Adam Spencer',
      reason: 'closed',
    })
    expect(deleteMock).toHaveBeenCalledWith('pickups/PRG211126000382', {
      requestorName: 'Adam Spencer',
      reason: 'closed',
    })
    expect(p.id).toBe('PRG211126000382')
    expect(p.status).toBe('CANCELLED')
    expect(() => PickupSchema.parse(p)).not.toThrow()
  })

  it('refuses to cancel without both query params, naming every missing one', async () => {
    await expect(adapter.cancelPickup(creds, 'PRG211126000382')).rejects.toThrow(
      /requestorName and reason/,
    )
    await expect(
      adapter.cancelPickup(creds, 'PRG211126000382', { reason: 'closed' }),
    ).rejects.toThrow(/requestorName/)
    await expect(
      adapter.cancelPickup(creds, 'PRG211126000382', { requestorName: 'Adam Spencer' }),
    ).rejects.toThrow(/reason/)
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
