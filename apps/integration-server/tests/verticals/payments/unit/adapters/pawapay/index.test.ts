import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { PawapayAdapter } from '../../../../../../src/verticals/payments/adapters/pawapay/index'

// pawaPay's v2 OpenAPI (https://docs.pawapay.io/v2/api-reference/openapi_v2.yaml)
// defines no GET on any collection: /v2/deposits, /v2/payouts and /v2/refunds are
// POST-only, and there is no customer resource at all. Every list method, and the
// get methods that sat on fabricated paths, must refuse before sending anything.

const creds = { accessToken: 'tok' }

describe('PawapayAdapter read methods refuse without a request', () => {
  const request = vi.fn()
  beforeEach(() => {
    request.mockReset()
    vi.spyOn(axios, 'create').mockReturnValue({
      get: request,
      post: request,
      delete: request,
      request,
    } as never)
  })
  afterEach(() => vi.restoreAllMocks())

  const adapter = new PawapayAdapter()
  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    [
      'listCustomers',
      () => adapter.listCustomers(creds, { page: 1, limit: 10 }),
      /no customer resource/,
    ],
    ['getCustomer', () => adapter.getCustomer(creds, 'c1'), /no customer resource/],
    [
      'listCharges',
      () => adapter.listCharges(creds, { page: 1, limit: 10 }),
      /cannot list deposits/,
    ],
    ['getCharge', () => adapter.getCharge(creds, 'd1'), /GET \/v2\/deposits\/\{depositId\}/],
    [
      'listRefunds',
      () => adapter.listRefunds(creds, { page: 1, limit: 10 }),
      /cannot list refunds/,
    ],
    [
      'listPayouts',
      () => adapter.listPayouts(creds, { page: 1, limit: 10 }),
      /cannot list payouts/,
    ],
    ['getPayout', () => adapter.getPayout(creds, 'p1'), /GET \/v2\/payouts\/\{payoutId\}/],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const err = await call().then(
        () => {
          throw new Error(`${name} resolved`)
        },
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
      expect(err.message).toMatch(message)
      expect(request).not.toHaveBeenCalled()
    })
  }
})
