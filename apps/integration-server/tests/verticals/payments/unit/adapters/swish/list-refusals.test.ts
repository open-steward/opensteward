import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwishAdapter } from '../../../../../../src/verticals/payments/adapters/swish/index'

// Swish documents no collection GET for any resource. Every documented read
// is a GET by a merchant-generated instructionUUID:
//   https://developer.swish.nu/api/payment-request/v2 — Endpoints:
//     PUT /swish-cpcapi/api/v2/paymentrequests/{instructionUUID}
//     GET /swish-cpcapi/api/v1/paymentrequests/{instructionUUID}
//     PATCH /swish-cpcapi/api/v1/paymentrequests/{instructionUUID}
//   https://developer.swish.nu/api/refunds/v2 — Endpoints:
//     PUT /swish-cpcapi/api/v2/refunds/{instructionUUID}
//     GET /swish-cpcapi/api/v1/refunds{instructionUUID}
//   https://developer.swish.nu/api/payouts/v1 — Endpoints:
//     POST /swish-cpcapi/api/v1/payouts/
//     GET /swish-cpcapi/api/v1/payouts/{instructionUUID}
// and https://developer.swish.nu/api lists no customer API at all.

const credentials = { accessToken: 'tok' }

function spyOnHttp() {
  const create = vi.spyOn(axios, 'create')
  const get = vi.spyOn(axios, 'get')
  const request = vi.spyOn(axios, 'request')
  return { create, get, request }
}

async function expectRefusal(call: () => Promise<unknown>, pattern: RegExp) {
  const spies = spyOnHttp()
  const err = await call().then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(Error)
  expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
  expect((err as Error).message).toMatch(pattern)
  // Refused before any client was built or any request was sent.
  expect(spies.create).not.toHaveBeenCalled()
  expect(spies.get).not.toHaveBeenCalled()
  expect(spies.request).not.toHaveBeenCalled()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SwishAdapter list refusals', () => {
  const adapter = new SwishAdapter()

  it('listCharges throws 501 NOT_SUPPORTED without sending a request', async () => {
    await expectRefusal(
      () => adapter.listCharges(credentials, { page: 1, limit: 10 }),
      /^Swish cannot list charges: /,
    )
  })

  it('listRefunds throws 501 NOT_SUPPORTED without sending a request', async () => {
    await expectRefusal(
      () => adapter.listRefunds(credentials, { page: 1, limit: 10 }),
      /^Swish cannot list refunds: /,
    )
  })

  it('listPayouts throws 501 NOT_SUPPORTED without sending a request', async () => {
    await expectRefusal(
      () => adapter.listPayouts(credentials, { page: 1, limit: 10 }),
      /^Swish cannot list payouts: /,
    )
  })

  it('listCustomers throws 501 NOT_SUPPORTED without sending a request', async () => {
    await expectRefusal(
      () => adapter.listCustomers(credentials, { page: 1, limit: 10 }),
      /^Swish cannot list customers: /,
    )
  })

  it('getCharge throws 501 NOT_SUPPORTED without sending a request', async () => {
    await expectRefusal(
      () => adapter.getCharge(credentials, 'abc'),
      /^Swish cannot read charges through this adapter: /,
    )
  })

  it('getCustomer throws 501 NOT_SUPPORTED without sending a request', async () => {
    await expectRefusal(
      () => adapter.getCustomer(credentials, 'abc'),
      /^Swish cannot read customers: /,
    )
  })
})
