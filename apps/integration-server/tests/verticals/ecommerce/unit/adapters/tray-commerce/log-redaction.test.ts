/**
 * Docs: https://developers.tray.com.br/ `#api-de-produtos` — "All API
 * requests require `?access_token={token}`" is mandated by the platform,
 * not a choice this adapter makes. The risk that creates: `access_token`
 * must never reach a log line.
 *
 * `TrayCommerceClient` (see `client.ts`) puts `access_token` on axios
 * `params`, never string-concatenated into the URL. `LOG_REDACT_PATHS`
 * (`packages/shared/src/server/create-server.ts`) redacts `err.config.params`
 * on every AxiosError a route logs (`err.config.url` is deliberately left
 * unredacted for operability). This test drives a REAL `TrayCommerceClient`
 * request that fails with an axios-shaped error carrying the live token on
 * `config.params`, routes it through the exact logger config every service
 * boots with, and asserts the token never appears in the logged line — while
 * the method, URL and upstream status the operator needs still do.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import Fastify from 'fastify'
import { buildLoggerConfig } from '@opensteward/shared'
import { TrayCommerceClient } from '../../../../../../src/verticals/ecommerce/adapters/tray-commerce/client'

const LEAK = 'DO-NOT-LOG-access-token-9f21c8'

afterEach(() => {
  vi.restoreAllMocks()
})

/** A real `AxiosError` shape, thrown from inside a real `TrayCommerceClient.get()` call. */
async function triggerRealClientError(): Promise<unknown> {
  const get = vi.fn().mockRejectedValue(
    Object.assign(new Error('Request failed with status code 502'), {
      name: 'AxiosError',
      isAxiosError: true,
      config: {
        method: 'get',
        url: 'products',
        baseURL: 'https://minhaloja.commercesuite.com.br/web_api',
        params: { access_token: LEAK, page: 1, limit: 50 },
      },
      response: { status: 502, data: { message: 'Bad gateway' } },
    }),
  )
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never)

  const client = new TrayCommerceClient({
    accessToken: LEAK,
    extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
  })
  try {
    await client.get('products', { page: 1, limit: 50 })
    throw new Error('expected client.get to reject')
  } catch (err) {
    return err
  }
}

async function captureLoggedError(err: unknown): Promise<{ logs: string; body: string }> {
  const lines: string[] = []
  const stream = { write: (s: string) => void lines.push(s) }
  const loggerConfig = buildLoggerConfig(true)
  const fastify = Fastify({ logger: { ...(loggerConfig as object), stream } })
  fastify.get('/products', async () => {
    throw err
  })
  const res = await fastify.inject({ method: 'GET', url: '/products' })
  await fastify.close()
  return { logs: lines.join(''), body: res.body }
}

describe('tray-commerce token-in-query-string log safety', () => {
  it('keeps access_token out of the log line when a real client request fails', async () => {
    const err = await triggerRealClientError()
    const { logs } = await captureLoggedError(err)
    expect(logs).not.toContain(LEAK)
  })

  it('keeps access_token out of the error response body too', async () => {
    const err = await triggerRealClientError()
    const { body } = await captureLoggedError(err)
    expect(body).not.toContain(LEAK)
  })

  it('still logs the method, URL and upstream status an operator needs to debug it', async () => {
    const err = await triggerRealClientError()
    const { logs } = await captureLoggedError(err)
    expect(logs).toContain('"method":"get"')
    expect(logs).toContain('products')
    expect(logs).toContain('"status":502')
  })
})
