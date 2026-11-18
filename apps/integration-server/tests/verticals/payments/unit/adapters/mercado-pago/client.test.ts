/**
 * MercadoPagoClient puts per-request headers on the wire, and an absolute
 * URL (the /users/me lookup on api.mercadolibre.com) reaches that host
 * rather than being joined to the api.mercadopago.com base URL. The URL case
 * runs real axios on the exact config the client hands to axios.create, so a
 * config change such as allowAbsoluteUrls: false would fail it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { create, httpGet } = vi.hoisted(() => {
  const httpGet = vi.fn()
  return { httpGet, create: vi.fn((_config: unknown) => ({ get: httpGet, post: vi.fn() })) }
})

vi.mock('axios', () => ({ default: { create } }))

import { MercadoPagoClient } from '../../../../../../src/verticals/payments/adapters/mercado-pago/client'
import {
  API_BASE_URL,
  USERS_ME_URL,
} from '../../../../../../src/verticals/payments/adapters/mercado-pago/constants'

beforeEach(() => {
  create.mockClear()
  httpGet.mockReset()
  httpGet.mockResolvedValue({ data: { ok: true } })
})

describe('MercadoPagoClient.get', () => {
  it('sends the given headers with the request', async () => {
    const client = new MercadoPagoClient({ accessToken: 'APP_USR-x' })
    await client.get('/v1/chargebacks/1', undefined, { 'X-Caller-Id': '2320007493' })
    expect(httpGet).toHaveBeenCalledWith('/v1/chargebacks/1', {
      params: undefined,
      headers: { 'X-Caller-Id': '2320007493' },
    })
  })

  it('sends no extra header when none is given', async () => {
    const client = new MercadoPagoClient({ accessToken: 'APP_USR-x' })
    await client.get('/v1/payments/search', { offset: 0, limit: 10 })
    expect(httpGet).toHaveBeenCalledWith('/v1/payments/search', {
      params: { offset: 0, limit: 10 },
      headers: undefined,
    })
  })

  it('authenticates with the bearer token against the Mercado Pago base URL', () => {
    new MercadoPagoClient({ accessToken: 'APP_USR-x' })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: API_BASE_URL,
        headers: expect.objectContaining({ Authorization: 'Bearer APP_USR-x' }),
      }),
    )
  })

  it('with the config the client gives axios, real axios sends /users/me to api.mercadolibre.com', async () => {
    new MercadoPagoClient({ accessToken: 'APP_USR-x' })
    const config = create.mock.calls[0]?.[0]
    const real = (await vi.importActual<{ default: typeof import('axios') }>('axios')).default
    const instance = real.create(config as Parameters<typeof real.create>[0])
    expect(instance.getUri({ url: USERS_ME_URL })).toBe('https://api.mercadolibre.com/users/me')
    expect(instance.getUri({ url: '/v1/chargebacks/1' })).toBe(`${API_BASE_URL}/v1/chargebacks/1`)
  })
})
