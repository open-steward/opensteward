/**
 * What a completed Connect Link names the connection it produces.
 *
 * Operators browse a list of CONNECTIONS, not of links, so the link's own
 * label ("Q2 onboarding") stops identifying anything the moment a second
 * customer completes the same link. The connection therefore takes
 * "<customer> - <adapter>" instead, derived at completion on both paths
 * (OAuth start → pending state → callback, and direct credentials).
 *
 * A link with no customer bound keeps its own label — that is the pre-existing
 * behaviour every operator-minted link relies on, and the fallback guarded
 * below.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { consumePendingState } from '../../src/auth/oauth'
import { connectionLabelFor, createConnectRouter } from '../../src/control-plane/connect-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'connect-label-secret-must-be-32-chars-x'

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

const hostInfo = { get: async () => hostBranding() } as never

/** An api_key adapter that accepts anything — the direct-credentials path. */
const fakeAdapter = {
  credentialFields: () => [{ name: 'apiKey', label: 'API key', type: 'password' }],
  exchangeCredentials: async () => ({ accessToken: 'exchanged' }),
}

/** An oauth2 adapter — only `getAuthUrl` is reached before the pending state. */
const fakeOAuthAdapter = {
  getAuthUrl: (state: string) => `https://oauth.example/authorize?state=${state}`,
}

const PLATFORMS = [
  { vertical: 'accounting', slug: 'fake', name: 'Fake Books', auth_type: 'api_key' },
  { vertical: 'accounting', slug: 'fake-oauth', name: 'Fake OAuth', auth_type: 'oauth2' },
] as never

describe('the label a completed Connect Link gives the connection', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore
  let endUsers: EndUserStore
  let credentials: CredentialStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    endUsers = await EndUserStore.create(handle, SECRET)
    credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({
        store: credentials,
        registry: {
          get: (_vertical: string, platform: string) =>
            platform === 'fake-oauth' ? fakeOAuthAdapter : fakeAdapter,
        } as never,
        sessions,
        endUsers,
        hostInfo,
        platforms: PLATFORMS,
      }),
    )
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  /** Complete a link the non-OAuth way and answer with the connection's label. */
  async function completeWithCredentials(token: string): Promise<string | null> {
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/credentials`,
      payload: { vertical: 'accounting', platform: 'fake', fields: { apiKey: 'k' } },
    })
    expect(res.statusCode).toBe(201)
    const { connectionId } = res.json().data as { connectionId: string }
    const row = await credentials.getRow(connectionId)
    return row?.label ?? null
  }

  it('names the customer and the adapter on a pinned link', async () => {
    const customer = await endUsers.create({
      tenantId: 't',
      email: 'jane@acme.example',
      displayName: 'Jane Doe',
    })
    const session = await sessions.create({
      tenantId: 't',
      label: 'Q2 onboarding',
      endUserId: customer.id,
      allowedPlatforms: [{ vertical: 'accounting', slug: 'fake' }],
    })

    expect(await completeWithCredentials(session.token)).toBe('Jane Doe - Fake Books')
  })

  it('uses the name a self-registering customer gave, on the same shape', async () => {
    const session = await sessions.create({
      tenantId: 't',
      label: 'Self serve link',
      allowSelfRegister: true,
    })
    const registered = await fastify.inject({
      method: 'POST',
      url: `/connect/${session.token}/customer`,
      payload: { email: 'sam@acme.example', displayName: 'Sam Rivera' },
    })
    expect(registered.statusCode).toBe(200)

    expect(await completeWithCredentials(session.token)).toBe('Sam Rivera - Fake Books')
  })

  it('falls back to the email address when the customer has no display name', async () => {
    const customer = await endUsers.create({ tenantId: 't', email: 'ops@acme.example' })
    // No allowedPlatforms — the customer picks the adapter themselves.
    const session = await sessions.create({
      tenantId: 't',
      label: 'Acme onboarding',
      endUserId: customer.id,
    })

    expect(await completeWithCredentials(session.token)).toBe('ops@acme.example - Fake Books')
  })

  it("keeps the link's own label when no customer is bound to it", async () => {
    const session = await sessions.create({ tenantId: 't', label: 'Acme books' })

    expect(await completeWithCredentials(session.token)).toBe('Acme books')
  })

  it('hands the derived label to the OAuth callback, not the link label', async () => {
    const customer = await endUsers.create({
      tenantId: 't',
      email: 'jane@acme.example',
      displayName: 'Jane Doe',
    })
    const session = await sessions.create({
      tenantId: 't',
      label: 'Q2 onboarding',
      endUserId: customer.id,
    })

    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${session.token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'fake-oauth' },
    })
    expect(res.statusCode).toBe(200)
    const { redirectUrl } = res.json().data as { redirectUrl: string }
    const state = new URL(redirectUrl).searchParams.get('state')!

    // The callback reads this back verbatim, which is why nothing in
    // auth-router has to change.
    const pending = consumePendingState(state)
    expect(pending?.label).toBe('Jane Doe - Fake OAuth')
    expect(pending?.sessionId).toBe(session.id)
  })
})

describe('connectionLabelFor', () => {
  const JANE = { displayName: 'Jane Doe', email: 'jane@acme.example' }

  it('joins the customer and the adapter', () => {
    expect(connectionLabelFor(JANE, 'Fake Books', 'fake', 'Q2 onboarding')).toBe(
      'Jane Doe - Fake Books',
    )
  })

  it('uses the whole email address when there is no display name', () => {
    expect(
      connectionLabelFor({ displayName: null, email: 'jane@acme.example' }, 'Xero', 'xero', 'L'),
    ).toBe('jane@acme.example - Xero')
    // Whitespace is not a name.
    expect(
      connectionLabelFor({ displayName: '  ', email: 'jane@acme.example' }, 'Xero', 'xero', 'L'),
    ).toBe('jane@acme.example - Xero')
  })

  it('falls back to the slug for an adapter the catalogue does not name', () => {
    expect(connectionLabelFor(JANE, undefined, 'fortnox', 'L')).toBe('Jane Doe - fortnox')
  })

  it("keeps the link's own label when there is no customer", () => {
    expect(connectionLabelFor(null, 'Fake Books', 'fake', 'Acme books')).toBe('Acme books')
    // A record with neither name nor address names nobody either — and an
    // empty label would escape createWithUniqueLabel's collision handling.
    expect(
      connectionLabelFor({ displayName: null, email: '' }, 'Fake Books', 'fake', 'Acme books'),
    ).toBe('Acme books')
  })
})
