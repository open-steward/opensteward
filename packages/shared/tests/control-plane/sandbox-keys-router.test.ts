/**
 * Self-serve sandbox keys — POST /test/v1/keys.
 *
 * The contract: OFF by default (an unauthenticated mint endpoint is an
 * operator's deliberate choice, never a shipped default), and when on, every
 * key it mints is harmless by construction — test mode, throwaway tenant,
 * 7-day expiry — with an IP budget on the mint itself.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { createSandboxKeysRouter } from '../../src/control-plane/sandbox-keys-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'sandbox-keys-router-secret-must-be-32c!'

describe('sandbox-keys-router', () => {
  let handle: DbHandle
  let apiKeys: ApiKeyStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    apiKeys = await ApiKeyStore.create(handle, SECRET)
  })
  afterEach(async () => {
    await handle?.close()
  })

  async function build(opts: {
    enabled?: boolean
    testMode?: boolean
    rateMax?: number
  }): Promise<FastifyInstance> {
    const fastify = Fastify({ logger: false })
    await fastify.register(
      createSandboxKeysRouter({
        apiKeys,
        selfServeEnabled: () => opts.enabled ?? false,
        testModeEnabled: () => opts.testMode ?? true,
        ...(opts.rateMax ? { rateLimit: { max: opts.rateMax, windowMs: 3_600_000 } } : {}),
      }),
    )
    await fastify.ready()
    return fastify
  }

  it('403 SANDBOX_SELF_SERVE_DISABLED by default', async () => {
    const fastify = await build({})
    try {
      const res = await fastify.inject({ method: 'POST', url: '/keys' })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('SANDBOX_SELF_SERVE_DISABLED')
      expect(await apiKeys.list()).toHaveLength(0)
    } finally {
      await fastify.close()
    }
  })

  it('mints a working, expiring, test-mode key in a throwaway tenant when enabled', async () => {
    const fastify = await build({ enabled: true })
    try {
      const res = await fastify.inject({
        method: 'POST',
        url: '/keys',
        payload: { label: 'evaluation' },
      })
      expect(res.statusCode).toBe(201)
      const key = res.json().data
      expect(key.plaintext.startsWith('osk_test_sandbox-')).toBe(true)
      expect(key.mode).toBe('test')
      expect(key.tenantId).toMatch(/^sandbox-[0-9a-f]{8}$/)
      expect(key.label).toBe('evaluation')
      // 7-day expiry, enforced by the store itself.
      expect(key.expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 3_600_000)
      expect(key.expiresAt).toBeLessThan(Date.now() + 8 * 24 * 3_600_000)

      const verified = await apiKeys.verify(key.plaintext)
      expect(verified).not.toBeNull()
      expect(verified!.mode).toBe('test')

      // Two mints never share a tenant — evaluators are isolated.
      const second = await fastify.inject({ method: 'POST', url: '/keys' })
      expect(second.json().data.tenantId).not.toBe(key.tenantId)
    } finally {
      await fastify.close()
    }
  })

  it('rate-limits the mint per IP', async () => {
    const fastify = await build({ enabled: true, rateMax: 2 })
    try {
      expect((await fastify.inject({ method: 'POST', url: '/keys' })).statusCode).toBe(201)
      expect((await fastify.inject({ method: 'POST', url: '/keys' })).statusCode).toBe(201)
      const third = await fastify.inject({ method: 'POST', url: '/keys' })
      expect(third.statusCode).toBe(429)
      expect(third.headers['retry-after']).toBeDefined()
    } finally {
      await fastify.close()
    }
  })

  it('test-mode kill switch wins over self-serve', async () => {
    const fastify = await build({ enabled: true, testMode: false })
    try {
      const res = await fastify.inject({ method: 'POST', url: '/keys' })
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('TEST_MODE_DISABLED')
    } finally {
      await fastify.close()
    }
  })
})
