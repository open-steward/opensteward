import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { PesapalAdapter } from '../../../../../../src/verticals/payments/adapters/pesapal'

// Pesapal API 3.0 documents no customer resource, no transaction list and no
// refund read (Postman collection linked from the API reference lists nine
// requests; the only GETs are GetIpnList and GetTransactionStatus). Each of
// these read methods must refuse with 501 NOT_SUPPORTED and send nothing.

const creds = { accessToken: 'tok' }

describe('PesapalAdapter undocumented reads refuse before sending', () => {
  let createSpy: ReturnType<typeof vi.spyOn>
  const request = vi.fn()

  beforeEach(() => {
    request.mockReset()
    const fake = { get: request, post: request, delete: request, request }
    createSpy = vi.spyOn(axios, 'create').mockReturnValue(fake as never)
  })

  afterEach(() => {
    createSpy.mockRestore()
  })

  const cases: Array<[string, (a: PesapalAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listCustomers',
      (a) => a.listCustomers(creds, { page: 1, limit: 10 }),
      /cannot list customers/,
    ],
    ['getCustomer', (a) => a.getCustomer(creds, 'c1'), /cannot get customers/],
    ['listCharges', (a) => a.listCharges(creds, { page: 1, limit: 10 }), /cannot list charges/],
    ['getCharge', (a) => a.getCharge(creds, 'ch1'), /cannot get charges/],
    ['listRefunds', (a) => a.listRefunds(creds, { page: 1, limit: 10 }), /cannot list refunds/],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const err = await call(new PesapalAdapter()).then(
        () => null,
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err).not.toBeNull()
      expect(err!.message).toMatch(message)
      expect(err!.statusCode).toBe(501)
      expect(err!.code).toBe('NOT_SUPPORTED')
      expect(request).not.toHaveBeenCalled()
      expect(createSpy).not.toHaveBeenCalled()
    })
  }
})
