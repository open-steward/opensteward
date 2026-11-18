/**
 * SupersetClient against a mock Superset on an ephemeral port: the
 * login → CSRF → guest-token handshake, session caching, single-flight
 * login, re-login on 401, and config resolution.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SupersetClient,
  SupersetHttpError,
  jwtExpiry,
  resolveSupersetConfig,
} from '../../src/core/analytics/superset-client'
import { fakeJwt, startMockSuperset, type MockSuperset } from './superset-mock'

let mock: MockSuperset

beforeEach(async () => {
  mock = await startMockSuperset()
})
afterEach(async () => {
  await mock.close()
})

const client = (over: Partial<ConstructorParameters<typeof SupersetClient>[0]> = {}) =>
  new SupersetClient({ url: mock.url, username: 'svc', password: 'svc-password', ...over })

const REQ = {
  user: { username: 'u', first_name: 'u', last_name: 'x' },
  resources: [{ type: 'dashboard' as const, id: '6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11' }],
  rls: [{ clause: "owner_tenant_id IN ('acme')" }],
}

describe('SupersetClient', () => {
  it('logs in, fetches CSRF + cookie, and mints a guest token', async () => {
    const c = client()
    const res = await c.createGuestToken(REQ)
    expect(res.token).toMatch(/\./)
    expect(res.expiresAt).toBeGreaterThan(Date.now())
    expect(mock.guestTokenRequests).toEqual([REQ])
  })

  it('reuses the session until it expires', async () => {
    const c = client()
    await c.createGuestToken(REQ)
    await c.createGuestToken(REQ)
    expect(mock.logins).toBe(1)
  })

  it('logs in once for concurrent first calls', async () => {
    const c = client()
    await Promise.all([c.createGuestToken(REQ), c.createGuestToken(REQ), c.createGuestToken(REQ)])
    expect(mock.logins).toBe(1)
  })

  it('logs in again when the cached access token is about to expire', async () => {
    await mock.close()
    mock = await startMockSuperset({ accessTtlSeconds: 10 }) // < the 30 s skew
    const c = client()
    await c.createGuestToken(REQ)
    await c.createGuestToken(REQ)
    expect(mock.logins).toBe(2)
  })

  it('re-logs in once on a 401 and retries', async () => {
    const c = client()
    await c.createGuestToken(REQ)
    mock.revokeTokens()
    await c.createGuestToken(REQ)
    expect(mock.logins).toBe(2)
    expect(mock.guestTokenRequests).toHaveLength(2)
  })

  it('throws SupersetHttpError on bad credentials and on a refused token', async () => {
    await expect(client({ password: 'wrong' }).createGuestToken(REQ)).rejects.toBeInstanceOf(
      SupersetHttpError,
    )
    mock.failGuestTokens(403)
    await expect(client().createGuestToken(REQ)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses to log in without a service account', async () => {
    await expect(client({ username: '', password: '' }).createGuestToken(REQ)).rejects.toThrow(
      /service account is not configured/,
    )
  })

  it('reports health without throwing', async () => {
    expect(await client().health()).toBe(true)
    const dead = new SupersetClient({
      url: 'http://127.0.0.1:9',
      username: 'a',
      password: 'b',
      timeoutMs: 500,
    })
    expect(await dead.health()).toBe(false)
  })
})

describe('helpers', () => {
  it('reads a JWT exp without verifying', () => {
    expect(jwtExpiry(fakeJwt({ exp: 123 }))).toBe(123)
    expect(jwtExpiry('not-a-jwt')).toBeNull()
    expect(jwtExpiry(fakeJwt({}))).toBeNull()
  })

  it('resolves config: off without a URL, public URL defaults to the internal one', () => {
    expect(resolveSupersetConfig({})).toBeNull()
    expect(resolveSupersetConfig({ url: 'ftp://x' })).toBeNull()
    expect(
      resolveSupersetConfig({
        url: 'http://superset:8088/',
        serviceUsername: ' svc ',
        servicePassword: 'p',
      }),
    ).toEqual({
      url: 'http://superset:8088',
      publicUrl: 'http://superset:8088',
      serviceUsername: 'svc',
      servicePassword: 'p',
    })
    expect(
      resolveSupersetConfig({ url: 'http://superset:8088', publicUrl: 'https://bi.example.com/' })
        ?.publicUrl,
    ).toBe('https://bi.example.com')
  })
})
