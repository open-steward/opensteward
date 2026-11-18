import { describe, it, expect, vi, beforeEach } from 'vitest'

const { postMock, putMock } = vi.hoisted(() => ({ postMock: vi.fn(), putMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/fedex/client', () => ({
  FedExClient: class {
    post = postMock
    put = putMock
  },
}))

import {
  transformPickup,
  transformCancelledPickup,
  buildCreatePickupBody,
  buildCancelPickupBody,
  type FedExCreatePickupOutput,
  type FedExCancelPickupOutput,
} from '../../../../../../../src/verticals/logistics/adapters/fedex/transform/pickup'
import { PickupSchema } from '../../../../../../../src/verticals/logistics/schema/pickup'
import { FedExAdapter } from '../../../../../../../src/verticals/logistics/adapters/fedex'
import type {
  Credentials,
  PickupRequestParams,
} from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * FedEx's Pickup API answers a create with nothing but a confirmation code,
 * the Express dispatch station and optional alerts (`CreatePickupOutputVO`
 * in the vendor spec) — no address, no window, no status. So the canonical
 * record is assembled from the request, and the status is whichever call
 * just returned 200: there is no upstream enum, and therefore no value that
 * could fail to map to `'unknown'`. A pickup FedEx will not schedule is a
 * 4xx, never a status.
 *
 * Fixture values are the spec's own examples: `pickupConfirmationCode`
 * "3001", `location` "COSA", the Collierville sample origin.
 */

/** `output` of a successful `POST /pickup/v1/pickups`, as the spec documents it. */
function makeCreateOutput(
  overrides: Partial<FedExCreatePickupOutput> = {},
): FedExCreatePickupOutput {
  return {
    pickupConfirmationCode: '3001',
    location: 'COSA',
    alerts: [{ code: 'PICKUP.CONFIRMATION.NOTE', alertType: 'NOTE', message: 'Pickup scheduled.' }],
    ...overrides,
  }
}

/** `output` of a successful `PUT /pickup/v1/pickups/cancel`. */
function makeCancelOutput(
  overrides: Partial<FedExCancelPickupOutput> = {},
): FedExCancelPickupOutput {
  return {
    pickupConfirmationCode: 'NQAA97',
    cancelConfirmationMessage: 'Requested pickup has been cancelled Successfully.',
    ...overrides,
  }
}

/** The canonical request that produced the fixture — 11:00–17:00 Central on 3 July. */
function makeRequest(overrides: Partial<PickupRequestParams> = {}): PickupRequestParams {
  return {
    address: {
      name: 'Contact Name for Pickup',
      company: 'Acme Industries',
      street1: '10 Fedex Pkwy',
      street2: 'Suite 302',
      city: 'Collierville',
      state: 'TN',
      postalCode: '38017',
      country: 'US',
      phone: '1234567890',
    },
    readyAt: new Date('2026-07-03T16:00:00Z'),
    closeAt: new Date('2026-07-03T22:00:00Z'),
    timeZone: 'America/Chicago',
    carrierCode: 'FDXG',
    packageLocation: 'FRONT',
    packages: [{ weight: { value: 5, unit: 'lb' } }, { weight: { value: 2, unit: 'lb' } }],
    shipmentIds: ['794644790138'],
    instructions: 'Please ring bell at loading dock.',
    ...overrides,
  }
}

describe('fedex transformPickup', () => {
  it('uses the confirmation code as both id and confirmationNumber', () => {
    const p = transformPickup(makeCreateOutput(), makeRequest())
    expect(p.id).toBe('3001')
    expect(p.confirmationNumber).toBe('3001')
    expect(p.carrierId).toBe('fedex')
  })

  it("reports SCHEDULED — a confirmation code is FedEx's whole notion of scheduled", () => {
    expect(transformPickup(makeCreateOutput(), makeRequest()).status).toBe('SCHEDULED')
  })

  it('does not read status from alerts — a WARNING still accompanies a scheduled pickup', () => {
    const warned = makeCreateOutput({
      alerts: [
        { code: 'PICKUP.ADDRESS.MISMATCH', alertType: 'WARNING', message: 'Postal-City Mismatch.' },
      ],
    })
    expect(transformPickup(warned, makeRequest()).status).toBe('SCHEDULED')
  })

  it('assembles address, window, shipments and note from the request, since FedEx echoes none of them', () => {
    const req = makeRequest()
    const p = transformPickup(makeCreateOutput(), req)
    expect(p.address).toBe(req.address)
    expect(p.readyAt).toEqual(new Date('2026-07-03T16:00:00Z'))
    expect(p.closeAt).toEqual(new Date('2026-07-03T22:00:00Z'))
    expect(p.shipmentIds).toEqual(['794644790138'])
    expect(p.instructions).toBe('Please ring bell at loading dock.')
  })

  it('leaves optional request fields undefined rather than defaulting them', () => {
    const p = transformPickup(
      makeCreateOutput(),
      makeRequest({ closeAt: undefined, shipmentIds: undefined, instructions: undefined }),
    )
    expect(p.closeAt).toBeUndefined()
    expect(p.shipmentIds).toBeUndefined()
    expect(p.instructions).toBeUndefined()
  })

  it('preserves the raw output by reference', () => {
    const raw = makeCreateOutput()
    expect(transformPickup(raw, makeRequest()).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() =>
      PickupSchema.parse(transformPickup(makeCreateOutput(), makeRequest())),
    ).not.toThrow()
  })

  it('parses a Ground response too, which carries no location and no alerts', () => {
    const ground = { pickupConfirmationCode: 'CPU16200910' } as FedExCreatePickupOutput
    expect(PickupSchema.safeParse(transformPickup(ground, makeRequest())).success).toBe(true)
  })
})

describe('fedex transformCancelledPickup', () => {
  it('reports CANCELLED with the id the caller cancelled', () => {
    const p = transformCancelledPickup(makeCancelOutput(), 'NQAA97')
    expect(p.id).toBe('NQAA97')
    expect(p.status).toBe('CANCELLED')
    expect(p.carrierId).toBe('fedex')
  })

  it('carries the echoed confirmation code, and no fabricated window', () => {
    const p = transformCancelledPickup(makeCancelOutput(), 'NQAA97')
    expect(p.confirmationNumber).toBe('NQAA97')
    // scheduledDate is a day, not an instant; turning it into readyAt would
    // invent a time of day.
    expect(p.readyAt).toBeUndefined()
  })

  it('leaves confirmationNumber undefined when FedEx does not echo it', () => {
    const p = transformCancelledPickup(
      makeCancelOutput({ pickupConfirmationCode: undefined }),
      'NQAA97',
    )
    expect(p.confirmationNumber).toBeUndefined()
  })

  it('preserves the raw output by reference', () => {
    const raw = makeCancelOutput()
    expect(transformCancelledPickup(raw, 'NQAA97').metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() =>
      PickupSchema.parse(transformCancelledPickup(makeCancelOutput(), 'NQAA97')),
    ).not.toThrow()
  })
})

describe('fedex buildCreatePickupBody', () => {
  const body = () => buildCreatePickupBody(makeRequest(), '510087XXX')
  const origin = () => body().originDetail as Record<string, unknown>
  const location = () => origin().pickupLocation as Record<string, Record<string, unknown>>

  it('maps the canonical address onto originDetail.pickupLocation', () => {
    expect(location().contact).toEqual({
      personName: 'Contact Name for Pickup',
      companyName: 'Acme Industries',
      phoneNumber: '1234567890',
    })
    expect(location().address).toEqual({
      streetLines: ['10 Fedex Pkwy', 'Suite 302'],
      city: 'Collierville',
      stateOrProvinceCode: 'TN',
      postalCode: '38017',
      countryCode: 'US',
    })
  })

  it('drops an absent street2 from streetLines instead of sending an empty line', () => {
    const b = buildCreatePickupBody(
      makeRequest({ address: { ...makeRequest().address, street2: undefined } }),
      'X',
    )
    const loc = (b.originDetail as Record<string, unknown>).pickupLocation as Record<
      string,
      Record<string, unknown>
    >
    expect(loc.address.streetLines).toEqual(['10 Fedex Pkwy'])
  })

  it("renders readyAt/closeAt as wall-clock in the pickup's zone, no designator", () => {
    // 16:00Z on 3 July is 11:00 CDT. FedEx ignores any offset, so the string
    // must already be local — UTC wall-clock would book the courier five
    // hours late, and a UTC container would never notice.
    expect(origin().readyDateTimestamp).toBe('2026-07-03T11:00:00')
    expect(origin().customerCloseTime).toBe('17:00:00')
  })

  it('rolls the local date back when the instant is past midnight UTC', () => {
    const b = buildCreatePickupBody(
      makeRequest({
        readyAt: new Date('2026-07-04T02:30:00Z'),
        closeAt: new Date('2026-07-04T07:00:00Z'),
        timeZone: 'America/Los_Angeles',
      }),
      'X',
    )
    const o = b.originDetail as Record<string, unknown>
    expect(o.readyDateTimestamp).toBe('2026-07-03T19:30:00')
    expect(o.customerCloseTime).toBe('00:00:00')
  })

  it('prefers literal readyDateTimestamp / customerCloseTime when the caller supplies them', () => {
    const b = buildCreatePickupBody(
      makeRequest({
        timeZone: undefined,
        readyDateTimestamp: '2026-07-03T09:30:00',
        customerCloseTime: '18:00:00',
      }),
      'X',
    )
    const o = b.originDetail as Record<string, unknown>
    expect(o.readyDateTimestamp).toBe('2026-07-03T09:30:00')
    expect(o.customerCloseTime).toBe('18:00:00')
  })

  it('names timeZone when a Date must be localised and no zone was given', () => {
    expect(() => buildCreatePickupBody(makeRequest({ timeZone: undefined }), 'X')).toThrow(
      /timeZone \(IANA zone/,
    )
  })

  it('rejects an unknown timeZone by name', () => {
    expect(() =>
      buildCreatePickupBody(makeRequest({ timeZone: 'Mars/Olympus_Mons' }), 'X'),
    ).toThrow('fedex: unknown timeZone "Mars/Olympus_Mons"')
  })

  it('names every missing key at once', () => {
    const run = () =>
      buildCreatePickupBody(
        makeRequest({
          carrierCode: undefined,
          closeAt: undefined,
          timeZone: undefined,
          readyDateTimestamp: '2026-07-03T09:30:00',
        }),
        undefined,
      )
    expect(run).toThrow(/^fedex: createPickup requires /)
    expect(run).toThrow(/carrierCode \(FedEx operating company/)
    expect(run).toThrow(/accountNumber \(/)
    expect(run).toThrow(/closeAt \(/)
  })

  it('requires packageLocation for Ground but not for Express', () => {
    expect(() => buildCreatePickupBody(makeRequest({ packageLocation: undefined }), 'X')).toThrow(
      /packageLocation \(/,
    )
    expect(() =>
      buildCreatePickupBody(makeRequest({ carrierCode: 'FDXE', packageLocation: undefined }), 'X'),
    ).not.toThrow()
  })

  it('takes the account number from the request first, then the adapter config', () => {
    expect(
      buildCreatePickupBody(makeRequest({ accountNumber: '999' }), '510087XXX')
        .associatedAccountNumber,
    ).toEqual({
      value: '999',
    })
    expect(body().associatedAccountNumber).toEqual({ value: '510087XXX' })
  })

  it('counts packages, and leaves packageCount undefined when none were given', () => {
    expect(body().packageCount).toBe(2)
    expect(
      buildCreatePickupBody(makeRequest({ packages: undefined }), 'X').packageCount,
    ).toBeUndefined()
  })

  it('lets an explicit packageCount win over the counted packages', () => {
    expect(buildCreatePickupBody(makeRequest({ packageCount: 7 }), 'X').packageCount).toBe(7)
  })

  it('sends instructions as remarks, unmodified', () => {
    expect(body().remarks).toBe('Please ring bell at loading dock.')
  })

  it('copies known FedEx keys through to their level and nothing else', () => {
    const b = buildCreatePickupBody(
      makeRequest({ trackingNumber: '795803657326', pickupDateType: 'FUTURE_DAY', bogus: 'no' }),
      'X',
    )
    expect(b.trackingNumber).toBe('795803657326')
    expect((b.originDetail as Record<string, unknown>).pickupDateType).toBe('FUTURE_DAY')
    expect(b.bogus).toBeUndefined()
    // Canonical keys never reach the wire.
    expect(b.address).toBeUndefined()
    expect(b.readyAt).toBeUndefined()
    expect(b.timeZone).toBeUndefined()
  })
})

describe('fedex buildCancelPickupBody', () => {
  const ground = { carrierCode: 'FDXG', scheduledDate: '2026-07-03' }
  const express = { carrierCode: 'FDXE', scheduledDate: '2026-07-03', location: 'COSA' }

  it('puts the id in the body as pickupConfirmationCode alongside the keys FedEx cancels by', () => {
    expect(buildCancelPickupBody('CPU16200910', ground, '510087XXX')).toEqual({
      associatedAccountNumber: { value: '510087XXX' },
      pickupConfirmationCode: 'CPU16200910',
      carrierCode: 'FDXG',
      scheduledDate: '2026-07-03',
      location: undefined,
      remarks: undefined,
    })
  })

  it('sends reason as remarks', () => {
    expect(
      buildCancelPickupBody('3001', { ...express, reason: 'Shipment held' }, 'X').remarks,
    ).toBe('Shipment held')
  })

  it('names carrierCode and scheduledDate when cancelled by id alone', () => {
    const run = () => buildCancelPickupBody('3001', undefined, 'X')
    expect(run).toThrow(/^fedex: cancelPickup requires /)
    expect(run).toThrow(/carrierCode \(/)
    expect(run).toThrow(/scheduledDate \(the dispatch date as YYYY-MM-DD\)/)
  })

  it('requires location for Express, where FedEx needs the dispatch station, but not for Ground', () => {
    expect(() => buildCancelPickupBody('3001', { ...express, location: undefined }, 'X')).toThrow(
      /location \(/,
    )
    expect(() => buildCancelPickupBody('CPU16200910', ground, 'X')).not.toThrow()
  })

  it('names accountNumber when neither the request nor the config carries one', () => {
    expect(() => buildCancelPickupBody('3001', ground, undefined)).toThrow(/accountNumber \(/)
  })
})

/**
 * The step before the transform: what the adapter does with the envelope
 * FedEx sends. Both pickup calls wrap their payload in `{ transactionId,
 * output }`, and a 200 with no `output.pickupConfirmationCode` is the shape
 * of a mis-routed or empty reply, which must not become a pickup with id
 * `undefined`.
 */
describe('fedex adapter pickup calls', () => {
  const credentials = { accessToken: 'TEST_token' } as Credentials
  const adapter = new FedExAdapter({ accountNumber: '510087XXX' })

  beforeEach(() => {
    postMock.mockReset()
    putMock.mockReset()
  })

  it('POSTs /pickup/v1/pickups and returns the scheduled pickup', async () => {
    postMock.mockResolvedValueOnce({ transactionId: 'txn-1', output: makeCreateOutput() })
    const p = await adapter.createPickup(credentials, makeRequest())
    expect(postMock).toHaveBeenCalledWith(
      '/pickup/v1/pickups',
      expect.objectContaining({ carrierCode: 'FDXG' }),
    )
    expect(p.id).toBe('3001')
    expect(p.status).toBe('SCHEDULED')
    expect(() => PickupSchema.parse(p)).not.toThrow()
  })

  it('throws when the create reply carries no confirmation code', async () => {
    postMock.mockResolvedValueOnce({ transactionId: 'txn-1', output: { alerts: [] } })
    await expect(adapter.createPickup(credentials, makeRequest())).rejects.toThrow(
      'FedEx createPickup returned no pickupConfirmationCode',
    )
  })

  it('PUTs /pickup/v1/pickups/cancel with the id in the body and returns CANCELLED', async () => {
    putMock.mockResolvedValueOnce({ transactionId: 'txn-2', output: makeCancelOutput() })
    const p = await adapter.cancelPickup(credentials, 'NQAA97', {
      carrierCode: 'FDXE',
      scheduledDate: '2026-07-03',
      location: 'COSA',
    })
    expect(putMock).toHaveBeenCalledWith(
      '/pickup/v1/pickups/cancel',
      expect.objectContaining({ pickupConfirmationCode: 'NQAA97', location: 'COSA' }),
    )
    expect(p.status).toBe('CANCELLED')
    expect(() => PickupSchema.parse(p)).not.toThrow()
  })

  it('refuses to cancel by id alone before calling FedEx', async () => {
    await expect(adapter.cancelPickup(credentials, 'NQAA97')).rejects.toThrow(
      /cancelPickup requires carrierCode/,
    )
    expect(putMock).not.toHaveBeenCalled()
  })

  it('throws when the cancel reply carries no output', async () => {
    putMock.mockResolvedValueOnce({ transactionId: 'txn-2' })
    await expect(
      adapter.cancelPickup(credentials, 'CPU16200910', {
        carrierCode: 'FDXG',
        scheduledDate: '2026-07-03',
      }),
    ).rejects.toThrow('FedEx cancelPickup returned no output')
  })
})
