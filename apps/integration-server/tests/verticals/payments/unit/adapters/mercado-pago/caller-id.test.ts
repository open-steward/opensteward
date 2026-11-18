/**
 * Mercado Pago chargeback reads send X-Caller-Id, resolved from /users/me.
 *
 * GET /v1/chargebacks/{id} documents, under Header:
 *   "`X-Caller-Id` (integer, required)
 *    ID of the authenticated user (`seller ID`) and owner of the requested resource."
 * and answers 403 invalid_user_for_operation: "The caller does not have
 * permission to access the requested resource (not the owner of the case or
 * supporting file)."
 * https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/get-chargeback/get.md
 *
 * Mercado Pago's own credentials guide sends an access token to /users/me:
 *   "if you perform a **GET** request to the `/users/me` resource, it would be
 *    like this: curl -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}'
 *    https://api.mercadolibre.com/users/me"
 * https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/additional-content/your-integrations/credentials.md
 *
 * and the users guide for that host documents the answer carrying the id:
 *   "Recibirás toda la información del usuario relacionado al token usado,
 *    por ejemplo: { "id": 2320007493, "nickname": "TESTUSER942900259", ..."
 * https://developers.mercadolibre.com.ar/es_ar/consulta-de-usuarios
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { MercadoPagoAdapter } from '../../../../../../src/verticals/payments/adapters/mercado-pago'
import { USERS_ME_URL } from '../../../../../../src/verticals/payments/adapters/mercado-pago/constants'
import { DisputeSchema } from '../../../../../../src/verticals/payments/schema/dispute'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/mercado-pago/client', () => ({
  MercadoPagoClient: class {
    readonly token: string
    constructor(credentials: Credentials) {
      this.token = String(credentials.accessToken)
    }
    get = (path: string, params?: unknown, headers?: Record<string, string>) =>
      getMock(this.token, path, params, headers)
    post = vi.fn()
  },
}))

/** Sellers by access token, as /users/me would answer (documented shape). */
const SELLERS: Record<string, number> = {
  'APP_USR-seller-a': 2320007493,
  'APP_USR-seller-b': 202593498,
}
const CASE_OWNER: Record<string, number> = { '123456789': 2320007493 }

/** The documented get-chargeback response example. */
const documentedCase = {
  id: '123456789',
  payments: [987654321],
  currency: 'BRL',
  amount: '50.00',
  reason: 'unauthorized',
  reason_id: '6',
  coverage_applied: true,
  coverage_eligible: true,
  documentation_required: true,
  documentation_status: 'pending',
  date_documentation_deadline: '2024-02-15T23:59:59.000-03:00',
  date_created: '2024-02-01T10:30:00.000-03:00',
  date_last_updated: '2024-02-03T14:00:00.000-03:00',
  live_mode: true,
}

function forbidden(): Error {
  return Object.assign(new Error('Request failed with status code 403'), {
    response: { status: 403, data: { error: 'invalid_user_for_operation' } },
  })
}

/**
 * A fake that honours only what is documented: /users/me answers by token,
 * and a chargeback read needs X-Caller-Id naming the case's owner, as an
 * integer, or it answers 403 invalid_user_for_operation.
 */
function serveDocumented() {
  getMock.mockImplementation(
    async (token: string, path: string, _params: unknown, headers?: Record<string, string>) => {
      if (path === USERS_ME_URL) {
        const id = SELLERS[token]
        if (id === undefined) throw Object.assign(new Error('401'), { response: { status: 401 } })
        return { id, nickname: 'TESTUSER942900259', country_id: 'BR' }
      }
      const m = /^\/v1\/chargebacks\/(\d+)$/.exec(path)
      if (m) {
        const caller = headers?.['X-Caller-Id']
        if (caller === undefined || !/^\d+$/.test(caller)) throw forbidden()
        if (Number(caller) !== CASE_OWNER[m[1]!]) throw forbidden()
        return { ...documentedCase, id: m[1] }
      }
      throw new Error(`unexpected path ${path}`)
    },
  )
}

const SELLER_A: Credentials = { accessToken: 'APP_USR-seller-a' }
const SELLER_B: Credentials = { accessToken: 'APP_USR-seller-b' }

function calls(path: string) {
  return getMock.mock.calls.filter((c) => c[1] === path)
}

let adapter: MercadoPagoAdapter
beforeEach(() => {
  getMock.mockReset()
  adapter = new MercadoPagoAdapter()
})

describe('MercadoPagoAdapter.getDispute X-Caller-Id', () => {
  it('looks the seller up at /users/me with the access token and sends it as X-Caller-Id', async () => {
    serveDocumented()
    const d = await adapter.getDispute(SELLER_A, '123456789')
    expect(DisputeSchema.parse(d).id).toBe('123456789')

    expect(getMock.mock.calls[0]).toEqual(['APP_USR-seller-a', USERS_ME_URL, undefined, undefined])
    expect(getMock.mock.calls[1]).toEqual([
      'APP_USR-seller-a',
      '/v1/chargebacks/123456789',
      undefined,
      { 'X-Caller-Id': '2320007493' },
    ])
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('looks the seller up at the host the Mercado Pago guide names', () => {
    expect(USERS_ME_URL).toBe('https://api.mercadolibre.com/users/me')
  })

  it('caches the seller id per connection: one lookup for repeated reads', async () => {
    serveDocumented()
    await adapter.getDispute(SELLER_A, '123456789')
    await adapter.getDispute(SELLER_A, '123456789')
    await Promise.all([
      adapter.getDispute(SELLER_A, '123456789'),
      adapter.getDispute(SELLER_A, '123456789'),
    ])
    expect(calls(USERS_ME_URL)).toHaveLength(1)
    expect(calls('/v1/chargebacks/123456789')).toHaveLength(4)
  })

  it('shares one in-flight lookup between concurrent first reads', async () => {
    serveDocumented()
    await Promise.all([
      adapter.getDispute(SELLER_A, '123456789'),
      adapter.getDispute(SELLER_A, '123456789'),
    ])
    expect(calls(USERS_ME_URL)).toHaveLength(1)
  })

  it('keeps connections apart: another token gets its own lookup and its own caller id', async () => {
    serveDocumented()
    await adapter.getDispute(SELLER_A, '123456789')
    // Seller B does not own the case, so the documented 403 comes back, and
    // the header it was refused with is B's own id, not A's cached one.
    await expect(adapter.getDispute(SELLER_B, '123456789')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(calls(USERS_ME_URL).map((c) => c[0])).toEqual(['APP_USR-seller-a', 'APP_USR-seller-b'])
    const chargebacks = calls('/v1/chargebacks/123456789')
    expect(chargebacks[1]![0]).toBe('APP_USR-seller-b')
    expect(chargebacks[1]![3]).toEqual({ 'X-Caller-Id': '202593498' })
  })

  it('a failed lookup sends no chargeback request and is not cached', async () => {
    serveDocumented()
    getMock.mockRejectedValueOnce(Object.assign(new Error('503'), { response: { status: 503 } }))
    await expect(adapter.getDispute(SELLER_A, '123456789')).rejects.toThrow('503')
    expect(calls('/v1/chargebacks/123456789')).toHaveLength(0)

    await adapter.getDispute(SELLER_A, '123456789')
    expect(calls(USERS_ME_URL)).toHaveLength(2)
    expect(calls('/v1/chargebacks/123456789')).toHaveLength(1)
  })

  it.each([
    ['no id', { nickname: 'TESTUSER942900259' }],
    ['a string id', { id: '2320007493' }],
    ['a non-integer id', { id: 2.5 }],
    ['a zero id', { id: 0 }],
  ])('throws on a /users/me answer with %s and sends no chargeback request', async (_l, body) => {
    getMock.mockResolvedValueOnce(body)
    await expect(adapter.getDispute(SELLER_A, '123456789')).rejects.toThrow(
      'Mercado Pago /users/me returned no seller id',
    )
    expect(getMock).toHaveBeenCalledTimes(1)
  })
})
