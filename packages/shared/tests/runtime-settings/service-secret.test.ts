/**
 * How integration-server authenticates its settings poll to admin-api.
 *
 * A bearer token is the wrong shape here. admin-api's `requireAuth` is
 * `jwtVerify()`, so a bearer must be a real JWT signed with `JWT_SECRET` — the
 * same key that signs admin *user* sessions. Handing that to integration-server
 * would let it mint itself an admin token.
 *
 * Instead the client carries a shared service secret in `X-Service-Secret`,
 * mirroring the `X-Admin-Secret` mechanism admin-api already uses in the
 * opposite direction.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import { RuntimeSettingsClient } from '../../src/runtime-settings/client'

let server: Server | undefined

/** Records the headers of the first request and answers with one setting. */
async function captureServer(): Promise<{ url: string; headers: () => Record<string, unknown> }> {
  let seen: Record<string, unknown> = {}
  server = createServer((req, res) => {
    seen = { ...req.headers }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ key: 'rate_limit.api_key.per_minute', value: 600, valueType: 'number' }] }))
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  const port = (server!.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}`, headers: () => seen }
}

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()))
  server = undefined
})

describe('RuntimeSettingsClient — service authentication', () => {
  it('sends the service secret so the poll is authenticated', async () => {
    const { url, headers } = await captureServer()
    const client = new RuntimeSettingsClient({
      adminApiUrl: url,
      serviceSecret: 's3rvice-secret-value',
      logger: { warn: () => {} },
    })
    await client.refresh()
    expect(headers()['x-service-secret']).toBe('s3rvice-secret-value')
  })

  it('never sends the secret as a bearer token', async () => {
    // A bearer would have to be a JWT signed with admin-api's JWT_SECRET —
    // the key that signs admin sessions. This service must not hold it.
    const { url, headers } = await captureServer()
    const client = new RuntimeSettingsClient({
      adminApiUrl: url,
      serviceSecret: 's3rvice-secret-value',
      logger: { warn: () => {} },
    })
    await client.refresh()
    expect(headers()['authorization']).toBeUndefined()
  })

  it('sends no credential header when none is configured', async () => {
    const { url, headers } = await captureServer()
    const client = new RuntimeSettingsClient({ adminApiUrl: url, logger: { warn: () => {} } })
    await client.refresh()
    expect(headers()['x-service-secret']).toBeUndefined()
    expect(headers()['authorization']).toBeUndefined()
  })

  it('still caches what it fetched', async () => {
    const { url } = await captureServer()
    const client = new RuntimeSettingsClient({
      adminApiUrl: url,
      serviceSecret: 'x'.repeat(32),
      logger: { warn: () => {} },
    })
    await client.refresh()
    expect(client.getNumber('rate_limit.api_key.per_minute', 1)).toBe(600)
  })
})
