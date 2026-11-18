import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import { nullRuntimeSettingsClient, RuntimeSettingsClient } from '../../src/runtime-settings/client'

function startAdminApiStub(
  body: unknown,
  statusCode = 200,
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(statusCode, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

describe('RuntimeSettingsClient', () => {
  let stub: { server: Server; url: string } | null = null

  afterEach(() => {
    stub?.server.close()
    stub = null
  })

  it('returns fallback when admin-api is not configured', () => {
    const client = nullRuntimeSettingsClient()
    expect(client.getNumber('rate_limit.api_key.per_minute', 600)).toBe(600)
    expect(client.getBoolean('features.mcp_enabled', true)).toBe(true)
  })

  it('warms cache from admin-api on start and returns the typed value', async () => {
    stub = await startAdminApiStub({
      data: [
        { key: 'rate_limit.api_key.per_minute', value: 1200, valueType: 'number' },
        { key: 'features.mcp_enabled', value: false, valueType: 'boolean' },
      ],
    })
    const client = new RuntimeSettingsClient({ adminApiUrl: stub.url, ttlMs: 60_000 })
    await client.refresh()
    expect(client.getNumber('rate_limit.api_key.per_minute', 600)).toBe(1200)
    expect(client.getBoolean('features.mcp_enabled', true)).toBe(false)
    client.stop()
  })

  it('falls back to the supplied default when the cache is missing a key', async () => {
    stub = await startAdminApiStub({ data: [] })
    const client = new RuntimeSettingsClient({ adminApiUrl: stub.url })
    await client.refresh()
    expect(client.getNumber('not.in.cache', 42)).toBe(42)
    client.stop()
  })

  it('keeps the cache warm when admin-api returns 500', async () => {
    stub = await startAdminApiStub({ data: [{ key: 'x', value: 5, valueType: 'number' }] })
    const client = new RuntimeSettingsClient({ adminApiUrl: stub.url })
    await client.refresh()
    expect(client.getNumber('x', 0)).toBe(5)

    // Swap stub for a 500 response — refresh should fail silently.
    stub.server.close()
    stub = await startAdminApiStub({ error: 'boom' }, 500)
    // Point the client at the new URL by mutating opts — easier than reconstructing.
    ;(client as unknown as { opts: { adminApiUrl: string } }).opts.adminApiUrl = stub.url
    await client.refresh()
    // Cache from the first fetch is preserved.
    expect(client.getNumber('x', 0)).toBe(5)
    client.stop()
  })

  it('returns fallback when valueType does not match the requested accessor', () => {
    const client = nullRuntimeSettingsClient()
    client.setForTest('x', 'oops', 'string')
    expect(client.getNumber('x', 99)).toBe(99) // wrong type → fallback
    expect(client.getString('x', 'default')).toBe('oops')
  })

  it('getJson returns cached JSON value, falls back on miss/mismatch', () => {
    interface ServerVar { default: string; enum: string[] }
    const client = nullRuntimeSettingsClient()
    client.setForTest('openapi.servers.host', { default: 'oi.acme.com', enum: ['oi.acme.com'] }, 'json')
    expect(client.getJson<ServerVar>('openapi.servers.host', { default: '', enum: [] })).toEqual({
      default: 'oi.acme.com',
      enum: ['oi.acme.com'],
    })
    // Missing key → fallback
    expect(client.getJson<ServerVar>('missing', { default: 'x', enum: [] })).toEqual({
      default: 'x',
      enum: [],
    })
    // Wrong valueType → fallback
    client.setForTest('wrong-type', 5, 'number')
    expect(client.getJson<ServerVar>('wrong-type', { default: 'fb', enum: [] })).toEqual({
      default: 'fb',
      enum: [],
    })
  })
})
