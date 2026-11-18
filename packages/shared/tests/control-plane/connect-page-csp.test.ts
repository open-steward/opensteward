/**
 * The hosted Connect page ships a Content-Security-Policy as the containment
 * layer beneath the output escaping: its single inline <script> carries a
 * per-response nonce, and the CSP `script-src` names that nonce — so a script
 * that ever slipped the escaper still could not execute.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'connect-csp-secret-must-be-32-chars!!'

function hostBranding(): HostBranding {
  return {
    name: null,
    logoDataUrl: null,
    primaryColor: null,
    secondaryColor: null,
    fontFamily: null,
    fontDataUrl: null,
    fontUrl: null,
    faviconDataUrl: null,
    hideAttribution: false,
    supportEmail: null,
    privacyPolicyUrl: null,
    termsOfServiceUrl: null,
    baseUrl: null,
  }
}

const fakeAdapter = {
  credentialFields: () => [{ name: 'apiKey', label: 'API key', type: 'password' }],
  exchangeCredentials: async () => ({ accessToken: 'x' }),
}
const PLATFORMS = [
  { vertical: 'accounting', slug: 'fake', name: 'Fake Books', auth_type: 'api_key' },
] as never

describe('Connect page CSP', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({
        store: credentials,
        registry: { get: () => fakeAdapter } as never,
        sessions,
        endUsers,
        hostInfo: { get: async () => hostBranding() } as never,
        platforms: PLATFORMS,
      }),
    )
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  it('sets a script-src nonce that matches the inline bootstrap script', async () => {
    const session = await sessions.create({
      tenantId: 't',
      label: 'csp test',
      allowedPlatforms: [{ vertical: 'accounting', slug: 'fake' }],
    })
    const res = await fastify.inject({ method: 'GET', url: `/connect/${session.token}` })
    expect(res.statusCode).toBe(200)

    const csp = res.headers['content-security-policy'] as string
    expect(csp).toBeDefined()
    const nonce = /script-src 'self' 'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce, 'CSP should carry a script nonce').toBeTruthy()
    // The one inline <script> must carry the same nonce, or the page's own
    // bootstrap would be blocked by its own policy.
    expect(res.body).toContain(`<script nonce="${nonce}">`)
    // Inline styles (operator branding) stay permitted; scripts do not.
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('sets the CSP on the error page too', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/connect/no-such-token' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-security-policy']).toContain("script-src 'self' 'nonce-")
  })
})
