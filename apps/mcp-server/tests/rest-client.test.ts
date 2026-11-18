import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { RestClient, RestClientError } from '../src/rest-client.js'

interface RecordedRequest {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
}

let server: http.Server
let baseUrl: string
let recorded: RecordedRequest[]
let respondWith: { status: number; body: unknown }

beforeEach(async () => {
  recorded = []
  respondWith = { status: 200, body: { data: [] } }
  server = http.createServer((req, res) => {
    recorded.push({ method: req.method ?? '?', url: req.url ?? '?', headers: req.headers })
    res.statusCode = respondWith.status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(respondWith.body))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
  vi.restoreAllMocks()
})

describe('RestClient', () => {
  it('forwards Bearer token + JSON Accept header', async () => {
    const client = new RestClient({ baseUrl, token: 'os_test', mode: 'tenant' })
    await client.listCustomers({ limit: 5 })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.headers['authorization']).toBe('Bearer os_test')
    expect(recorded[0]!.headers['accept']).toContain('application/json')
  })

  it('listResource hits /v1/{vertical}/{resource}?connection_id=...', async () => {
    const client = new RestClient({ baseUrl, token: 'os_test', mode: 'tenant' })
    await client.listResource('accounting', 'invoices', { connection_id: 'conn-1', limit: 25 })
    expect(recorded[0]!.url).toMatch(/^\/v1\/accounting\/invoices\?/)
    expect(recorded[0]!.url).toContain('connection_id=conn-1')
    expect(recorded[0]!.url).toContain('limit=25')
  })

  it('getResource hits /v1/{vertical}/{resource}/:id?connection_id=...', async () => {
    const client = new RestClient({ baseUrl, token: 'os_test', mode: 'tenant' })
    await client.getResource('crm', 'contacts', 'abc-1', 'conn-2')
    expect(recorded[0]!.url).toBe('/v1/crm/contacts/abc-1?connection_id=conn-2')
  })

  it('rejects with RestClientError on 4xx', async () => {
    respondWith = { status: 404, body: { error: { code: 'NOT_FOUND', message: 'nope' } } }
    const client = new RestClient({ baseUrl, token: 'os_test', mode: 'tenant' })
    await expect(client.getCustomer('missing')).rejects.toBeInstanceOf(RestClientError)
  })

  it('validateToken (tenant) probes /v1/customers?limit=1', async () => {
    const client = new RestClient({ baseUrl, token: 'os_test', mode: 'tenant' })
    await client.validateToken()
    expect(recorded[0]!.url).toMatch(/^\/v1\/customers\?/)
    expect(recorded[0]!.url).toContain('limit=1')
  })

  it('refuses cross-mode methods (listCustomers in end-user mode)', () => {
    const client = new RestClient({ baseUrl, token: 'eut_x', mode: 'end-user' })
    expect(() => client.listCustomers()).toThrow(/tenant mode/)
  })
})

describe('RestClient.getCapabilities', () => {
  const tenantClient = () => new RestClient({ baseUrl, token: 'osk_test', mode: 'tenant' })

  it('tenant mode reads GET /v1/capabilities, with the MCP user agent', async () => {
    respondWith = { status: 200, body: { data: { verticals: ['accounting', 'crm'] } } }
    expect(await tenantClient().getCapabilities()).toEqual(['accounting', 'crm'])
    expect(recorded[0]!.url).toBe('/v1/capabilities')
    expect(recorded[0]!.headers['user-agent']).toBe('@opensteward/mcp-server')
  })

  it('end-user mode reads GET /v1/me/capabilities', async () => {
    respondWith = { status: 200, body: { data: { verticals: ['crm'] } } }
    const client = new RestClient({ baseUrl, token: 'eut_t', mode: 'end-user' })
    expect(await client.getCapabilities()).toEqual(['crm'])
    expect(recorded[0]!.url).toBe('/v1/me/capabilities')
  })

  it('[] is an answer', async () => {
    respondWith = { status: 200, body: { data: { verticals: [] } } }
    expect(await tenantClient().getCapabilities()).toEqual([])
  })

  it('404 (an older server) is unknown', async () => {
    respondWith = { status: 404, body: { error: { code: 'NOT_FOUND' } } }
    expect(await tenantClient().getCapabilities()).toBeUndefined()
  })

  it('a 2xx of another shape is unknown, never []', async () => {
    respondWith = { status: 200, body: { data: [], meta: { totalCount: 0 } } }
    expect(await tenantClient().getCapabilities()).toBeUndefined()
  })

  it('a refusal throws with the server code', async () => {
    respondWith = { status: 403, body: { error: { code: 'MCP_KEY_REQUIRED', message: 'x' } } }
    const err = await tenantClient()
      .getCapabilities()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RestClientError)
    expect((err as RestClientError).status).toBe(403)
    expect((err as RestClientError).message).toContain('MCP_KEY_REQUIRED')
  })

  it('a 5xx throws with the server code', async () => {
    respondWith = { status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }
    const err = await tenantClient()
      .getCapabilities()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RestClientError)
    expect((err as RestClientError).status).toBe(500)
    expect((err as RestClientError).message).toContain('INTERNAL')
  })

  it('gives up after timeoutMs on a server that never answers [L7:G04]', async () => {
    const silent = http.createServer(() => {
      /* never answers */
    })
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(silent.address() as AddressInfo).port}`
    try {
      const started = Date.now()
      const err = await new RestClient({ baseUrl: url, token: 'osk_test', mode: 'tenant' })
        .getCapabilities({ timeoutMs: 200 })
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(RestClientError)
      expect((err as RestClientError).status).toBe(0)
      expect(Date.now() - started).toBeLessThan(1_000)
    } finally {
      silent.closeAllConnections()
      await new Promise<void>((r) => silent.close(() => r()))
    }
  })
})
