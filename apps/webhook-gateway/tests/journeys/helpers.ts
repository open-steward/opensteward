/**
 * Test bootstrap for the webhook-gateway journey suite.
 *
 * Boots the real gateway over a throwaway SQLite db, plus a controllable
 * upstream stub (a plain http.createServer) that the gateway forwards to. The
 * stub records what it receives and lets a test flip it between healthy (200)
 * and failing (500) so we can exercise the delivery, retry, and DLQ paths
 * without Docker or the real integration-server.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { resolveDbConfig } from '@opensteward/shared'
import { buildServer } from '../../src/core/server'
import type { DeliveryStore } from '../../src/core/db/delivery-store'
import type { RetryWorker } from '../../src/core/workers/retry-worker'

export interface UpstreamStub {
  url: string
  /** Every request body the stub received, as parsed JSON (or raw string). */
  received: unknown[]
  /** Exact bytes of every request body the stub received. */
  raw: Buffer[]
  /** Request headers of every request the stub received. */
  headers: IncomingHttpHeaders[]
  /** Flip the HTTP status the stub replies with (200 healthy, 500 failing). */
  setStatus: (code: number) => void
  close: () => Promise<void>
}

export async function startUpstreamStub(): Promise<UpstreamStub> {
  const received: unknown[] = []
  const raw: Buffer[] = []
  const headers: IncomingHttpHeaders[] = []
  let status = 200
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const bytes = Buffer.concat(chunks)
      raw.push(bytes)
      headers.push(req.headers)
      const text = bytes.toString('utf8')
      try {
        received.push(JSON.parse(text))
      } catch {
        received.push(text)
      }
      res.statusCode = status
      res.end(JSON.stringify({ ok: status < 400 }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    raw,
    headers,
    setStatus: (code) => {
      status = code
    },
    close: () => {
      if (!server.listening) return Promise.resolve()
      return new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

export interface GatewayTestServer {
  fastify: FastifyInstance
  deliveryStore: DeliveryStore
  retryWorker: RetryWorker
  cleanup: () => Promise<void>
}

/**
 * Boot the gateway with a single platform (`acme`, logistics vertical) routed
 * at the given upstream URL.
 */
export async function buildGatewayTestServer(upstreamUrl: string): Promise<GatewayTestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'oi-wg-'))
  const { fastify, deliveryStore, retryWorker } = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    // Throwaway SQLite db per journey run (env-free → never Postgres).
    db: resolveDbConfig({}, { sqlitePath: join(dir, 'delivery.db') }),
    platforms: {
      acme: { vertical: 'logistics', url: upstreamUrl, secret: 'acme-secret' },
    },
  })
  await fastify.ready()
  return {
    fastify,
    deliveryStore,
    retryWorker,
    cleanup: async () => {
      retryWorker.stop()
      await fastify.close()
      await deliveryStore.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
