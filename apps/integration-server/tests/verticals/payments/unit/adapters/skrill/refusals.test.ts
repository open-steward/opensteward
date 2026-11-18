import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { SkrillAdapter } from '../../../../../../src/verticals/payments/adapters/skrill/index'

// Skrill's only documented hosts are www.skrill.com/app/{pay,refund,query}.pl
// (Automated Payments and Merchant Query Interfaces Guide 3.3). None of them
// lists customers or refunds, and the MQI 'history' CSV has undocumented base
// columns, so these read methods must refuse before any request is sent.
const creds = { accessToken: 'mqi-password' }

describe('skrill read methods refuse without sending a request', () => {
  let createSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    createSpy = vi.spyOn(axios, 'create')
    createSpy.mockClear()
  })

  const cases: Array<[string, (a: SkrillAdapter) => Promise<unknown>]> = [
    ['listCustomers', (a) => a.listCustomers(creds, { page: 1, limit: 5 })],
    ['getCustomer', (a) => a.getCustomer(creds, 'cus_1')],
    ['listCharges', (a) => a.listCharges(creds, { page: 1, limit: 5 })],
    [
      'listCharges with updatedAfter',
      (a) =>
        a.listCharges(creds, { page: 1, limit: 5, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    ],
    ['getCharge', (a) => a.getCharge(creds, '104627261')],
    ['listRefunds', (a) => a.listRefunds(creds, { page: 1, limit: 5 })],
  ]

  for (const [name, call] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED`, async () => {
      const err = await call(new SkrillAdapter()).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(/^Skrill cannot /)
      expect(createSpy).not.toHaveBeenCalled()
    })
  }
})
