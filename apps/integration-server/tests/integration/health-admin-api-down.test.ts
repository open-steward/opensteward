/**
 * /health must answer while admin-api does not.
 *
 * Compose starts admin-api only once integration-server is healthy. Every
 * request used to await the Host → tenant lookup against admin-api first, with
 * no timeout, so on a runner where connecting to the not-yet-started admin-api
 * hung, /health hung with it: the healthcheck failed, admin-api never started,
 * and the compose smoke job went red on every run.
 *
 * The stand-in admin-api here accepts connections and never answers, which is
 * that hang. Probes skip the lookup; every other request waits at most the
 * lookup's timeout, then falls back to the default tenant.
 */
import { createServer, type Server, type Socket } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestServer, type TestServer } from './helpers'

let blackhole: Server
const sockets = new Set<Socket>()
let server: TestServer
let previousUrl: string | undefined

beforeAll(async () => {
  blackhole = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => blackhole.listen(0, '127.0.0.1', resolve))
  const { port } = blackhole.address() as { port: number }
  previousUrl = process.env['ADMIN_API_URL']
  process.env['ADMIN_API_URL'] = `http://127.0.0.1:${port}`
  server = await buildTestServer()
}, 30_000)

afterAll(async () => {
  await server?.cleanup()
  if (previousUrl === undefined) delete process.env['ADMIN_API_URL']
  else process.env['ADMIN_API_URL'] = previousUrl
  for (const s of sockets) s.destroy()
  await new Promise<void>((resolve) => blackhole.close(() => resolve()))
})

async function timed(url: string): Promise<{ status: number; ms: number }> {
  const started = Date.now()
  const res = await server.fastify.inject({ method: 'GET', url })
  return { status: res.statusCode, ms: Date.now() - started }
}

describe('admin-api accepts connections but never answers', () => {
  it('GET /health answers at once', async () => {
    const { status, ms } = await timed('/health')
    expect(status).toBe(200)
    expect(ms).toBeLessThan(1_000)
  })

  it('GET /version answers at once', async () => {
    const { status, ms } = await timed('/version')
    expect(status).toBe(200)
    expect(ms).toBeLessThan(1_000)
  })

  it('any other request waits at most the tenant lookup timeout, then answers', async () => {
    const { status, ms } = await timed('/v1/capabilities')
    expect(status).toBeGreaterThanOrEqual(200)
    expect(status).toBeLessThan(500)
    expect(ms).toBeLessThan(4_500)
  }, 15_000)
})
