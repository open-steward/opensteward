import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import type { FastifyInstance } from 'fastify'
import { resolveDbConfig } from '@opensteward/shared'
import { buildServer } from '../../src/core/server'
import type { Config } from '../../src/config'
import { loadConfig } from '../../src/config'

/** Decode a JWT payload without verifying — we only care about the claims. */
function claims(token: string): Record<string, unknown> {
  const [, payload] = token.split('.')
  return JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('operator JWT expiry', () => {
  let dir: string
  let fastify: FastifyInstance
  let cleanup: () => Promise<void>

  /**
   * Boots the real admin-api through `buildServer`, so this covers the actual
   * `fastify.register(jwt, ...)` wiring rather than a harness that re-declares
   * it — the whole point is that the register call was missing `sign`.
   */
  async function boot(expiresIn: string) {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-jwt-exp-'))
    const config: Config = {
      server: { port: 0, host: '127.0.0.1' },
      jwt: { secret: 'jwt-expiry-test-secret-that-is-long-enough', expiresIn },
      db: resolveDbConfig({}, { sqlitePath: join(dir, 'admin.db') }),
      verticals: [],
      storeSecret: 'jwt-expiry-test-store-secret-32-chars',
      sso: { publicBaseUrl: 'http://localhost:3001', adminUiUrl: 'http://localhost:3000' },
    }
    const built = await buildServer(config, { generatorMode: true })
    fastify = built.fastify
    await fastify.ready()
    cleanup = async () => {
      await fastify.close()
      await built.adminStore.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }

  /** First-run setup mints the admin and returns its token. */
  async function setupAndToken(): Promise<string> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'alice', password: 'SecurePass123!' },
    })
    expect(res.statusCode).toBe(201)
    return res.json().token as string
  }

  afterEach(async () => {
    await cleanup?.()
  })

  it('stamps iat and exp claims on a real login token', async () => {
    await boot('24h')
    const c = claims(await setupAndToken())
    expect(c['iat']).toBeTypeOf('number')
    expect(c['exp']).toBeTypeOf('number')
  })

  it('honours the configured lifetime', async () => {
    await boot('24h')
    const c = claims(await setupAndToken())
    expect((c['exp'] as number) - (c['iat'] as number)).toBe(24 * 60 * 60)
  })

  it('a shorter configured lifetime shortens the token', async () => {
    await boot('15m')
    const c = claims(await setupAndToken())
    expect((c['exp'] as number) - (c['iat'] as number)).toBe(15 * 60)
  })

  it('rejects an expired token with 401', async () => {
    await boot('1s')
    const token = await setupAndToken()
    // Wait the expiry out rather than faking the clock, so this also proves
    // the verifier enforces the claim end to end.
    await new Promise((r) => setTimeout(r, 1500))
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('jwt.expiresIn config', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-long-enough'
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('defaults to 24h', () => {
    delete process.env['JWT_EXPIRES_IN']
    expect(loadConfig().jwt.expiresIn).toBe('24h')
  })

  it('is overridable by JWT_EXPIRES_IN', () => {
    process.env['JWT_EXPIRES_IN'] = '12h'
    expect(loadConfig().jwt.expiresIn).toBe('12h')
  })

  it('ignores a blank JWT_EXPIRES_IN rather than minting unbounded tokens', () => {
    process.env['JWT_EXPIRES_IN'] = '   '
    expect(loadConfig().jwt.expiresIn).toBe('24h')
  })
})
