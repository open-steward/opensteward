/**
 * `features.mcp_enabled` — the emergency kill switch for AI-agent traffic.
 *
 * The setting is writable through the admin UI, the CLI and the SDK, and its
 * description promises a 403 `MCP_DISABLED` at the auth layer. These tests
 * pin that behaviour on both the tenant-key and end-user-token paths — a
 * setting nothing reads is a setting that lies.
 *
 * The resolver is a function, not a boolean, so an operator's flip lands on
 * the next runtime-settings poll rather than needing a redeploy. Each test
 * drives it through a mutable `enabled` flag to prove the read really is
 * per-request.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { EndUserTokenStore } from '../../src/auth/end-user-tokens'
import { CredentialStore } from '../../src/auth/store'
import { createCustomersRouter } from '../../src/control-plane/customers-router'
import { createEndUserRouter } from '../../src/control-plane/end-user-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'mcp-kill-switch-test-secret-must-be-32-chars'

interface Harness {
  fastify: FastifyInstance
  apiKeys: ApiKeyStore
  endUsers: EndUserStore
  endUserTokens: EndUserTokenStore
  handle: DbHandle
  /** Flipped mid-test to prove the setting is read per request. */
  setEnabled: (value: boolean) => void
}

async function setup(): Promise<Harness> {
  const handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  const endUsers = await EndUserStore.create(handle, SECRET)
  const endUserTokens = await EndUserTokenStore.create(handle, SECRET)
  const sessions = await ConnectSessionStore.create(handle)
  const credentials = await CredentialStore.create(handle, SECRET)

  let enabled = true
  const mcpEnabled = () => enabled

  const fastify = Fastify({ logger: false })
  await fastify.register(
    createCustomersRouter({ apiKeys, endUsers, sessions, credentials, mcpEnabled }),
  )
  await fastify.register(
    createEndUserRouter({
      tokens: endUserTokens,
      endUsers,
      sessions,
      credentials,
      mcpEnabled,
    }),
  )
  await fastify.ready()
  return {
    fastify,
    apiKeys,
    endUsers,
    endUserTokens,
    handle,
    setEnabled: (v: boolean) => {
      enabled = v
    },
  }
}

describe('features.mcp_enabled kill switch', () => {
  let h: Harness

  beforeEach(async () => {
    resetRateLimitBuckets()
    h = await setup()
  })

  afterEach(async () => {
    await h.fastify.close()
    await h.handle.close()
  })

  const bearer = (plaintext: string) => ({ authorization: `Bearer ${plaintext}` })

  describe('tenant keys', () => {
    it('refuses an mcp:read key with 403 MCP_DISABLED once the flag is off', async () => {
      const key = await h.apiKeys.mint({
        tenantId: 't',
        scopes: ['mcp:read', 'customers:read'],
      })

      const before = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(key.plaintext),
      })
      expect(before.statusCode).toBe(200)

      h.setEnabled(false)

      const after = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(key.plaintext),
      })
      expect(after.statusCode).toBe(403)
      expect(after.json()).toMatchObject({ error: { code: 'MCP_DISABLED' } })
    })

    it('leaves ordinary developer keys untouched when the flag is off', async () => {
      const key = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
      h.setEnabled(false)
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(key.plaintext),
      })
      expect(res.statusCode).toBe(200)
    })

    it('recovers as soon as the flag goes back on — no restart', async () => {
      const key = await h.apiKeys.mint({
        tenantId: 't',
        scopes: ['mcp:read', 'customers:read'],
      })
      h.setEnabled(false)
      const off = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(key.plaintext),
      })
      expect(off.statusCode).toBe(403)

      h.setEnabled(true)
      const on = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(key.plaintext),
      })
      expect(on.statusCode).toBe(200)
    })

    it('takes precedence over the read-only check — a write reports MCP_DISABLED', async () => {
      const key = await h.apiKeys.mint({
        tenantId: 't',
        scopes: ['mcp:read', 'customers:read'],
      })
      h.setEnabled(false)
      const res = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: bearer(key.plaintext),
        payload: { email: 'a@b.test' },
      })
      expect(res.statusCode).toBe(403)
      // Disabled entirely is the more useful diagnosis than read-only.
      expect(res.json().error.code).toBe('MCP_DISABLED')
    })
  })

  describe('end-user tokens', () => {
    async function mintToken() {
      const eu = await h.endUsers.create({ tenantId: 't', email: 'customer@acme.test' })
      return h.endUserTokens.mint({ endUserId: eu.id, tenantId: 't', label: 'laptop' })
    }

    it('refuses /v1/me with 403 MCP_DISABLED once the flag is off', async () => {
      const token = await mintToken()

      const before = await h.fastify.inject({
        method: 'GET',
        url: '/v1/me',
        headers: bearer(token.plaintext),
      })
      expect(before.statusCode).toBe(200)

      h.setEnabled(false)

      const after = await h.fastify.inject({
        method: 'GET',
        url: '/v1/me',
        headers: bearer(token.plaintext),
      })
      expect(after.statusCode).toBe(403)
      expect(after.json()).toMatchObject({ error: { code: 'MCP_DISABLED' } })
    })

    it('also closes /v1/me/connections', async () => {
      const token = await mintToken()
      h.setEnabled(false)
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/me/connections',
        headers: bearer(token.plaintext),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('MCP_DISABLED')
    })
  })

  it('defaults to enabled when no resolver is wired (embedders, tests)', async () => {
    const handle = await openDb({ sqlitePath: ':memory:' })
    const apiKeys = await ApiKeyStore.create(handle, SECRET)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const sessions = await ConnectSessionStore.create(handle)
    const credentials = await CredentialStore.create(handle, SECRET)
    const fastify = Fastify({ logger: false })
    // No mcpEnabled option at all — the previous behaviour must survive.
    await fastify.register(createCustomersRouter({ apiKeys, endUsers, sessions, credentials }))
    await fastify.ready()

    const key = await apiKeys.mint({ tenantId: 't', scopes: ['mcp:read', 'customers:read'] })
    const res = await fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key.plaintext}` },
    })
    expect(res.statusCode).toBe(200)

    await fastify.close()
    await handle.close()
  })
})

/**
 * The guard that makes the kill switch above reachable at all.
 *
 * Every MCP protection keys off `mcp:read`, and each returns early when the
 * scope is absent — so an agent driven by an ordinary API key got none of them.
 * It worked, silently, in the one mode an operator could neither see nor stop:
 * the kill switch two describe-blocks up would not have touched it.
 */
describe('an MCP client must present an mcp:read key', () => {
  let h: Harness

  beforeEach(async () => {
    resetRateLimitBuckets()
    h = await setup()
  })

  afterEach(async () => {
    await h.fastify.close()
    await h.handle.close()
  })

  const MCP_UA = '@opensteward/mcp-server'
  const get = (plaintext: string, userAgent?: string) =>
    h.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: {
        authorization: `Bearer ${plaintext}`,
        ...(userAgent ? { 'user-agent': userAgent } : {}),
      },
    })

  it('refuses the MCP client when the key lacks mcp:read', async () => {
    const key = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
    const res = await get(key.plaintext, MCP_UA)
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { code: 'MCP_KEY_REQUIRED' } })
    // The message is the operator's remedy: the MCP server prints the server's
    // error object verbatim, so this wording is what they actually read.
    expect(res.json().error.message).toContain('mcp:read')
    expect(res.json().error.message).toContain('/api-keys')
  })

  it('admits the MCP client when the key carries mcp:read', async () => {
    const key = await h.apiKeys.mint({
      tenantId: 't',
      scopes: ['mcp:read', 'customers:read'],
    })
    expect((await get(key.plaintext, MCP_UA)).statusCode).toBe(200)
  })

  it('leaves every non-MCP caller alone', async () => {
    // The one that matters most. An SDK user, curl, or a browser sends an
    // unscoped key all day; nothing outside MCP may change.
    const key = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
    expect((await get(key.plaintext)).statusCode).toBe(200)
    expect((await get(key.plaintext, 'axios/1.7.2')).statusCode).toBe(200)
    expect((await get(key.plaintext, 'Mozilla/5.0')).statusCode).toBe(200)
  })

  it('still matches when the client appends a version', async () => {
    const key = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
    const res = await get(key.plaintext, `${MCP_UA}/2.1.0`)
    expect(res.statusCode).toBe(403)
  })

  it('reports the missing scope ahead of the kill switch', async () => {
    // Both conditions true at once. The specific fault is the actionable one —
    // telling an operator MCP is disabled when their key was never an MCP key
    // sends them to the wrong setting.
    const key = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
    h.setEnabled(false)
    const res = await get(key.plaintext, MCP_UA)
    expect(res.json()).toMatchObject({ error: { code: 'MCP_KEY_REQUIRED' } })
  })

  it('does not disturb end-user tokens, which carry mcp:read by default', async () => {
    const eu = await h.endUsers.create({ tenantId: 't', email: 'customer@acme.test' })
    const tok = await h.endUserTokens.mint({ endUserId: eu.id, tenantId: 't' })
    const res = await h.fastify.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${tok.plaintext}`, 'user-agent': MCP_UA },
    })
    expect(res.statusCode).not.toBe(403)
  })
})
