import { describe, it, expect } from 'vitest'
import {
  mapPickupStatus,
  toPickupCreationRequest,
  transformPickupCancel,
  transformPickupCreation,
  type UPSPickupCancelResponse,
  type UPSPickupCreationResponse,
} from '../../../../../../../src/verticals/logistics/adapters/ups/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import type { PickupRequestParams } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * UPS's Pickup API confirms a scheduled on-call pickup with an 11-character
 * PRN and nothing else — no status field, no echo of the address or window.
 * The cancel response does not even repeat the PRN. So the record on both
 * sides is PRN + a status derived from `ResponseStatus` (or, for a Smart
 * Pickup cancel, `GWNStatus`), and the interesting logic is on the request
 * side, where UPS needs a good deal more than the canonical params name.
 */

/** The shape in Pickup.yaml's "Standard Example" response, with a real-length PRN. */
function makeCreation(
  overrides: Partial<UPSPickupCreationResponse> = {},
): UPSPickupCreationResponse {
  return {
    Response: {
      ResponseStatus: { Code: '1', Description: 'Success' },
      TransactionReference: { CustomerContext: 'CreatePickupRef' },
    },
    PRN: '2929602E9CP',
    RateStatus: { Code: '04', Description: 'Rate not requested' },
    ...overrides,
  }
}

function makeCancel(overrides: Partial<UPSPickupCancelResponse> = {}): UPSPickupCancelResponse {
  return {
    Response: { ResponseStatus: { Code: '1', Description: 'Success' } },
    PickupType: '01',
    ...overrides,
  }
}

/** The "Standard Example" request from Pickup.yaml, expressed as canonical params. */
function makeParams(overrides: Partial<PickupRequestParams> = {}): PickupRequestParams {
  return {
    address: {
      name: 'Pickup Manager',
      company: 'Pickup Proxy',
      street1: '123 Main Street',
      city: 'Allendale',
      state: 'NJ',
      postalCode: '07401',
      country: 'US',
      phone: '5555555555',
    },
    readyAt: new Date('2026-01-15T09:30:00Z'),
    closeAt: new Date('2026-01-15T17:00:00Z'),
    packages: [{ weight: { value: 5.5, unit: 'lb' } }, { weight: { value: 3, unit: 'lb' } }],
    serviceCode: '003',
    paymentMethod: '00',
    ...overrides,
  }
}

describe('ups mapPickupStatus', () => {
  it('maps every GWNStatus code UPS documents', () => {
    expect(mapPickupStatus('001')).toBe('SCHEDULED') // User Triggered
    expect(mapPickupStatus('002')).toBe('CANCELLED') // User Cancelled
    expect(mapPickupStatus('004')).toBe('FAILED') // Missed
    expect(mapPickupStatus('005')).toBe('FAILED') // Not In
    expect(mapPickupStatus('006')).toBe('FAILED') // Not Ready
    expect(mapPickupStatus('007')).toBe('FAILED') // Closed
    expect(mapPickupStatus('008')).toBe('CANCELLED') // Cancelled By Driver
  })

  it("leaves 003 Completed unmapped — the canonical enum has no 'completed'", () => {
    expect(mapPickupStatus('003')).toBe('unknown')
  })

  it("falls back to 'unknown' for 999 and for an absent code", () => {
    expect(mapPickupStatus('999')).toBe('unknown')
    expect(mapPickupStatus(undefined)).toBe('unknown')
  })
})

describe('ups transformPickupCreation', () => {
  it('uses the PRN as both id and confirmationNumber', () => {
    const p = transformPickupCreation(makeCreation())
    expect(p.id).toBe('2929602E9CP')
    expect(p.confirmationNumber).toBe('2929602E9CP')
    expect(p.carrierId).toBe('UPS')
  })

  it('is SCHEDULED when ResponseStatus.Code is 1', () => {
    expect(transformPickupCreation(makeCreation()).status).toBe('SCHEDULED')
  })

  it("is 'unknown' when a PRN arrives without a success code", () => {
    // Not a shape UPS documents, but the status must not be asserted from
    // the PRN alone.
    const raw = makeCreation({
      Response: { ResponseStatus: { Code: '0', Description: 'Failure' } },
    })
    expect(transformPickupCreation(raw).status).toBe('unknown')
  })

  it('throws, naming the PRN, when UPS returns 200 without one', () => {
    // `id` is required and there is nothing honest to put in it.
    const raw = makeCreation({ PRN: undefined })
    expect(() => transformPickupCreation(raw)).toThrow(/no PRN/)
    expect(() => transformPickupCreation(raw)).toThrow(/ResponseStatus\.Code=1/)
  })

  it('does not echo request fields it never received', () => {
    const p = transformPickupCreation(makeCreation())
    expect(p.address).toBeUndefined()
    expect(p.readyAt).toBeUndefined()
    expect(p.closeAt).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeCreation()
    expect(transformPickupCreation(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => PickupSchema.parse(transformPickupCreation(makeCreation()))).not.toThrow()
  })
})

describe('ups transformPickupCancel', () => {
  it('carries the PRN the caller cancelled, since the response omits it', () => {
    const p = transformPickupCancel(makeCancel(), '2929602E9CP')
    expect(p.id).toBe('2929602E9CP')
    expect(p.confirmationNumber).toBe('2929602E9CP')
  })

  it('is CANCELLED on a successful on-call cancel', () => {
    expect(transformPickupCancel(makeCancel(), '2929602E9CP').status).toBe('CANCELLED')
  })

  it("is 'unknown' when the success flag is missing", () => {
    const raw = makeCancel({ Response: { ResponseStatus: { Code: '0', Description: 'Failure' } } })
    expect(transformPickupCancel(raw, '2929602E9CP').status).toBe('unknown')
  })

  it('lets a Smart Pickup GWNStatus override the success flag', () => {
    // A cancel of an already-completed Smart Pickup still says Success, but
    // GWNStatus tells the truth about the pickup itself.
    const completed = makeCancel({ GWNStatus: { Code: '003', Description: 'Completed' } })
    expect(transformPickupCancel(completed, 'GPD49B1D615').status).toBe('unknown')
    const missed = makeCancel({ GWNStatus: { Code: '004', Description: 'Missed' } })
    expect(transformPickupCancel(missed, 'GPD49B1D615').status).toBe('FAILED')
    const cancelled = makeCancel({ GWNStatus: { Code: '002', Description: 'User Cancelled' } })
    expect(transformPickupCancel(cancelled, 'GPD49B1D615').status).toBe('CANCELLED')
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeCancel()
    expect(transformPickupCancel(raw, '2929602E9CP').metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() =>
      PickupSchema.parse(transformPickupCancel(makeCancel(), '2929602E9CP')),
    ).not.toThrow()
  })
})

describe('ups toPickupCreationRequest', () => {
  it('formats the window as a local date plus HHmm ready and close times', () => {
    const body = toPickupCreationRequest(makeParams())
    expect(body.PickupDateInfo).toEqual({
      PickupDate: '20260115',
      ReadyTime: '0930',
      CloseTime: '1700',
    })
  })

  it('reads instants as UTC wall-clock unless a timeZone is given', () => {
    // 09:30Z is 04:30 in New Jersey in January. Without a zone the instant is
    // read as UTC — the mirror of parseUPSDateTime on the tracking side.
    const body = toPickupCreationRequest(makeParams({ timeZone: 'America/New_York' }))
    expect(body.PickupDateInfo.ReadyTime).toBe('0430')
    expect(body.PickupDateInfo.CloseTime).toBe('1200')
    expect(body.PickupDateInfo.PickupDate).toBe('20260115')
  })

  it('keeps midnight at 00, not 24', () => {
    const body = toPickupCreationRequest(
      makeParams({
        readyAt: new Date('2026-01-15T00:00:00Z'),
        closeAt: new Date('2026-01-15T00:05:00Z'),
      }),
    )
    expect(body.PickupDateInfo.ReadyTime).toBe('0000')
  })

  it('rejects an invalid time zone by name', () => {
    expect(() => toPickupCreationRequest(makeParams({ timeZone: 'Mars/Olympus' }))).toThrow(
      /timeZone "Mars\/Olympus"/,
    )
  })

  it('maps the pickup address onto PickupAddress', () => {
    const body = toPickupCreationRequest(makeParams())
    expect(body.PickupAddress).toEqual({
      CompanyName: 'Pickup Proxy',
      ContactName: 'Pickup Manager',
      AddressLine: '123 Main Street',
      City: 'Allendale',
      StateProvince: 'NJ',
      PostalCode: '07401',
      CountryCode: 'US',
      ResidentialIndicator: 'N',
      Phone: { Number: '5555555555' },
    })
  })

  it('folds street2 into the single AddressLine the Pickup API takes', () => {
    const params = makeParams()
    params.address.street2 = 'Suite 300'
    expect(toPickupCreationRequest(params).PickupAddress.AddressLine).toBe(
      '123 Main Street, Suite 300',
    )
  })

  it('fills CompanyName and ContactName from whichever of name / company exists', () => {
    const nameOnly = makeParams()
    delete nameOnly.address.company
    expect(toPickupCreationRequest(nameOnly).PickupAddress.CompanyName).toBe('Pickup Manager')
    const companyOnly = makeParams()
    delete companyOnly.address.name
    expect(toPickupCreationRequest(companyOnly).PickupAddress.ContactName).toBe('Pickup Proxy')
  })

  it('flags residential and alternate-address only when told', () => {
    const body = toPickupCreationRequest(makeParams({ residential: true, alternateAddress: false }))
    expect(body.PickupAddress.ResidentialIndicator).toBe('Y')
    expect(body.AlternateAddressIndicator).toBe('N')
    const defaults = toPickupCreationRequest(makeParams())
    expect(defaults.PickupAddress.ResidentialIndicator).toBe('N')
    expect(defaults.AlternateAddressIndicator).toBe('Y')
  })

  it('never asks UPS to rate the pickup', () => {
    expect(toPickupCreationRequest(makeParams()).RatePickupIndicator).toBe('N')
  })

  it('builds one PickupPiece counting the packages, domestic by default', () => {
    expect(toPickupCreationRequest(makeParams()).PickupPiece).toEqual([
      { ServiceCode: '003', Quantity: '2', DestinationCountryCode: 'US', ContainerCode: '01' },
    ])
  })

  it('honours destinationCountryCode and containerCode overrides', () => {
    const body = toPickupCreationRequest(
      makeParams({ destinationCountryCode: 'CA', containerCode: '02' }),
    )
    expect(body.PickupPiece[0].DestinationCountryCode).toBe('CA')
    expect(body.PickupPiece[0].ContainerCode).toBe('02')
  })

  it('sums package weights in LBS with one decimal', () => {
    expect(toPickupCreationRequest(makeParams()).TotalWeight).toEqual({
      Weight: '8.5',
      UnitOfMeasurement: 'LBS',
    })
  })

  it('converts ounces into the pound total', () => {
    const body = toPickupCreationRequest(
      makeParams({
        packages: [{ weight: { value: 16, unit: 'oz' } }, { weight: { value: 1, unit: 'lb' } }],
      }),
    )
    expect(body.TotalWeight).toEqual({ Weight: '2.0', UnitOfMeasurement: 'LBS' })
  })

  it('sums in KGS when every package is metric', () => {
    const body = toPickupCreationRequest(
      makeParams({
        packages: [{ weight: { value: 2, unit: 'kg' } }, { weight: { value: 500, unit: 'g' } }],
      }),
    )
    expect(body.TotalWeight).toEqual({ Weight: '2.5', UnitOfMeasurement: 'KGS' })
  })

  it('omits TotalWeight and OverweightIndicator when any package has no weight', () => {
    // A partial sum would be a false statement about the pickup.
    const body = toPickupCreationRequest(
      makeParams({ packages: [{ weight: { value: 2, unit: 'kg' } }, { reference: 'no-weight' }] }),
    )
    expect(body.TotalWeight).toBeUndefined()
    expect(body.OverweightIndicator).toBeUndefined()
  })

  it('flags overweight when any single package exceeds 70 lb', () => {
    const heavy = toPickupCreationRequest(
      makeParams({
        packages: [{ weight: { value: 33, unit: 'kg' } }, { weight: { value: 1, unit: 'lb' } }],
      }),
    )
    expect(heavy.OverweightIndicator).toBe('Y')
    expect(toPickupCreationRequest(makeParams()).OverweightIndicator).toBe('N')
  })

  it('carries shipmentIds as TrackingData and omits it otherwise', () => {
    const withIds = toPickupCreationRequest(
      makeParams({ shipmentIds: ['1Z999AA10123456784', '1Z999AA10123456793'] }),
    )
    expect(withIds.TrackingData).toEqual([
      { TrackingNumber: '1Z999AA10123456784' },
      { TrackingNumber: '1Z999AA10123456793' },
    ])
    expect(toPickupCreationRequest(makeParams()).TrackingData).toBeUndefined()
    expect(toPickupCreationRequest(makeParams({ shipmentIds: [] })).TrackingData).toBeUndefined()
  })

  it('bills a known account: Shipper.Account plus PaymentMethod 01', () => {
    const body = toPickupCreationRequest(makeParams({ paymentMethod: undefined }), {
      accountNumber: 'A1B2C3',
    })
    expect(body.Shipper).toEqual({ Account: { AccountNumber: 'A1B2C3', AccountCountryCode: 'US' } })
    expect(body.PaymentMethod).toBe('01')
  })

  it('lets per-call accountNumber and accountCountryCode override the config default', () => {
    const body = toPickupCreationRequest(
      makeParams({ paymentMethod: undefined, accountNumber: 'X9Y8Z7', accountCountryCode: 'CA' }),
      { accountNumber: 'A1B2C3' },
    )
    expect(body.Shipper?.Account).toEqual({ AccountNumber: 'X9Y8Z7', AccountCountryCode: 'CA' })
  })

  it('sends no Shipper block when there is no account and payment is explicit', () => {
    const body = toPickupCreationRequest(makeParams({ paymentMethod: '00' }))
    expect(body.Shipper).toBeUndefined()
    expect(body.PaymentMethod).toBe('00')
  })

  it('refuses to guess a payment method when no account is known', () => {
    expect(() => toPickupCreationRequest(makeParams({ paymentMethod: undefined }))).toThrow(
      /paymentMethod/,
    )
  })

  it('refuses PaymentMethod 01 without an account to bill', () => {
    expect(() => toPickupCreationRequest(makeParams({ paymentMethod: '01' }))).toThrow(
      /accountNumber/,
    )
  })

  it('passes instructions and reference through', () => {
    const body = toPickupCreationRequest(
      makeParams({
        instructions: 'Ring the bell at the loading dock.',
        reference: 'CreatePickupRef',
      }),
    )
    expect(body.SpecialInstruction).toBe('Ring the bell at the loading dock.')
    expect(body.ReferenceNumber).toBe('CreatePickupRef')
  })

  it('reports every missing required key in one error', () => {
    const params = makeParams({ closeAt: undefined, serviceCode: undefined, packages: [] })
    delete params.address.phone
    let message = ''
    try {
      toPickupCreationRequest(params)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/^ups: createPickup requires /)
    for (const key of ['address.phone', 'closeAt', 'serviceCode', 'packages']) {
      expect(message).toContain(key)
    }
  })

  it('treats an empty-string serviceCode as missing', () => {
    expect(() => toPickupCreationRequest(makeParams({ serviceCode: '' }))).toThrow(/serviceCode/)
  })
})
