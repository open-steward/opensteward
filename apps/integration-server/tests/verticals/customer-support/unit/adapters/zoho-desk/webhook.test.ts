import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHmac, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  CredentialStore,
  createUnifiedWebhooksRouter,
  openDb,
  type DbHandle,
  type WebhookHandler,
  type WebhookVerificationCandidate,
} from '@opensteward/shared'
import {
  DOCUMENTED_JWKS_URL,
  claimTimeMs,
  createZohoDeskJwtVerifier,
  createZohoDeskWebhookHandler,
  jwksUrlsFor,
  verifyZohoDeskWebhook,
  parseZohoDeskWebhookEvents,
  type ZohoDeskJwtVerifierOptions,
} from '../../../../../../src/verticals/customer-support/adapters/zoho-desk/webhook'
import { ZohoDeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/zoho-desk'
import { WEBHOOK_HANDLERS } from '../../../../../../src/verticals/customer-support/webhooks'
import { WebhookEventSchema } from '../../../../../../src/verticals/customer-support/schema/webhook'

/**
 * Zoho Desk authenticates webhooks with an RS256 JWT in `X-ZDesk-JWT`
 * (https://desk.zoho.com/support/WebhookDocument.do, fetched 2026-09-28):
 * header { alg: RS256, typ: JWT, kid }, claims { iss: "orgId:<id>",
 * aud: "webhookId:<id>", exp, iat }, signed over header and claims only, keys
 * at https://desk.zoho.com/.well-known/jwks.json. These tests sign with a
 * generated key pair and serve it from a mocked JWKS fetch.
 */

const b64url = (v: string | Buffer): string => Buffer.from(v).toString('base64url')

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })

const KID = 'CsKIw63MEtRyP51FiugGRT1w7sYfnJfyO6vJgtZU8DE'
const ORG = '66503338'
const HOOK = '116554000001013027'
const NOW = 1_800_000_000_000

function jwk(key: KeyObject, kid: string): Record<string, unknown> {
  return { ...(key.export({ format: 'jwk' }) as object), kid, alg: 'RS256', use: 'sig' }
}

const jwksBody = (...keys: Array<Record<string, unknown>>) => JSON.stringify({ keys })

interface MintOptions {
  header?: Record<string, unknown>
  claims?: Record<string, unknown>
  key?: KeyObject
}

function mint(o: MintOptions = {}): string {
  const header = b64url(JSON.stringify({ kid: KID, typ: 'JWT', alg: 'RS256', ...o.header }))
  const nowSec = Math.floor(NOW / 1000)
  const claims = b64url(
    JSON.stringify({
      aud: `webhookId:${HOOK}`,
      iss: `orgId:${ORG}`,
      exp: nowSec + 179,
      iat: nowSec,
      ...o.claims,
    }),
  )
  const sig = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(o.key ?? privateKey)
  return `${header}.${claims}.${b64url(sig)}`
}

const CANDIDATE: WebhookVerificationCandidate = {
  connectionId: 'c1',
  extra: { dataCentre: 'us', orgId: ORG },
  webhookSecret: HOOK,
}

function okResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
}

function setup(
  responses: Array<Response | Error> = [okResponse(jwksBody(jwk(publicKey, KID)))],
  over: Partial<ZohoDeskJwtVerifierOptions> = {},
) {
  const clock = { t: NOW }
  const queue = [...responses]
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!
    if (next instanceof Error) throw next
    return next.clone()
  })
  const verifier = createZohoDeskJwtVerifier({
    fetch: fetchMock as unknown as typeof fetch,
    now: () => clock.t,
    ...over,
  })
  return { verifier, fetchMock, clock }
}

const body = Buffer.from('[]')
const hdr = (jwt: string) => ({ 'x-zdesk-jwt': jwt })

describe('zoho-desk X-ZDesk-JWT verification', () => {
  it('accepts a valid token and names the connection, marking the body unauthenticated', async () => {
    const { verifier, fetchMock } = setup()
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.toEqual({
      connectionId: 'c1',
      bodyAuthenticated: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(DOCUMENTED_JWKS_URL)
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('caches the key set: a second delivery does not fetch again', async () => {
    const { verifier, fetchMock } = setup()
    await verifier.verify(body, hdr(mint()), [CANDIDATE])
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('concurrent deliveries share one in-flight JWKS fetch instead of failing on the cooldown', async () => {
    const { verifier, fetchMock, clock } = setup(undefined, {
      jwksTtlMs: 1000,
      refetchCooldownMs: 30_000,
    })
    // Cold cache: both arrive before the first fetch settles.
    const cold = await Promise.all([
      verifier.verify(body, hdr(mint()), [CANDIDATE]),
      verifier.verify(body, hdr(mint()), [CANDIDATE]),
    ])
    expect(cold).toEqual([
      { connectionId: 'c1', bodyAuthenticated: false },
      { connectionId: 'c1', bodyAuthenticated: false },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // TTL refresh: same again.
    clock.t += 31_000
    const s = Math.floor(clock.t / 1000)
    const fresh = () => mint({ claims: { iat: s, exp: s + 179 } })
    const warm = await Promise.all([
      verifier.verify(body, hdr(fresh()), [CANDIDATE]),
      verifier.verify(body, hdr(fresh()), [CANDIDATE]),
    ])
    expect(warm.every((r) => r?.connectionId === 'c1')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects any alg other than RS256 even when the RSA-SHA256 signature is valid', async () => {
    const { verifier } = setup()
    // Control: the same key and claims verify under RS256.
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.not.toBeNull()
    for (const alg of ['RS512', 'PS256', 'HS256', 'none', 'rs256', undefined]) {
      await expect(
        verifier.verify(body, hdr(mint({ header: { alg } })), [CANDIDATE]),
      ).resolves.toBeNull()
    }
  })

  it('refetches after the TTL', async () => {
    const { verifier, fetchMock, clock } = setup(undefined, {
      jwksTtlMs: 1000,
      refetchCooldownMs: 0,
    })
    await verifier.verify(body, hdr(mint()), [CANDIDATE])
    clock.t += 1500
    await verifier.verify(body, hdr(mint()), [CANDIDATE])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reads the header case-insensitively', async () => {
    const { verifier } = setup()
    await expect(
      verifier.verify(body, { 'X-ZDesk-JWT': mint() }, [CANDIDATE]),
    ).resolves.not.toBeNull()
  })

  it('rejects a tampered signature', async () => {
    const { verifier } = setup()
    const [h, c, s] = mint().split('.') as [string, string, string]
    const sig = Buffer.from(s, 'base64url')
    sig[10] = sig[10]! ^ 0xff
    await expect(
      verifier.verify(body, hdr(`${h}.${c}.${b64url(sig)}`), [CANDIDATE]),
    ).resolves.toBeNull()
  })

  it('rejects claims swapped under a valid signature', async () => {
    const { verifier } = setup()
    const [h, , s] = mint({ claims: { iss: 'orgId:999' } }).split('.') as [string, string, string]
    const [, c] = mint().split('.') as [string, string]
    await expect(verifier.verify(body, hdr(`${h}.${c}.${s}`), [CANDIDATE])).resolves.toBeNull()
  })

  it('rejects a token signed by a key that is not in the JWKS under that kid', async () => {
    const { verifier } = setup()
    await expect(
      verifier.verify(body, hdr(mint({ key: other.privateKey })), [CANDIDATE]),
    ).resolves.toBeNull()
  })

  it('rejects alg none, with or without a signature segment, and never fetches keys', async () => {
    const { verifier, fetchMock } = setup()
    const h = b64url(JSON.stringify({ kid: KID, typ: 'JWT', alg: 'none' }))
    const c = mint().split('.')[1]!
    await expect(verifier.verify(body, hdr(`${h}.${c}.`), [CANDIDATE])).resolves.toBeNull()
    await expect(verifier.verify(body, hdr(`${h}.${c}`), [CANDIDATE])).resolves.toBeNull()
    await expect(
      verifier.verify(body, hdr(`${h}.${c}.${b64url('x')}`), [CANDIDATE]),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects HS256 signed with the public key as the HMAC secret', async () => {
    const { verifier, fetchMock } = setup()
    const h = b64url(JSON.stringify({ kid: KID, typ: 'JWT', alg: 'HS256' }))
    const c = mint().split('.')[1]!
    const pem = publicKey.export({ format: 'pem', type: 'spki' })
    const mac = createHmac('sha256', pem).update(`${h}.${c}`).digest()
    await expect(
      verifier.verify(body, hdr(`${h}.${c}.${b64url(mac)}`), [CANDIDATE]),
    ).resolves.toBeNull()
    // Same bytes relabelled RS256: the HMAC is not an RSA signature.
    const hRs = b64url(JSON.stringify({ kid: KID, typ: 'JWT', alg: 'RS256' }))
    const mac2 = createHmac('sha256', pem).update(`${hRs}.${c}`).digest()
    await expect(
      verifier.verify(body, hdr(`${hRs}.${c}.${b64url(mac2)}`), [CANDIDATE]),
    ).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed tokens: missing kid, wrong typ, crit, extra segments, non-base64url', async () => {
    const { verifier } = setup()
    for (const jwt of [
      mint({ header: { kid: undefined } }),
      mint({ header: { kid: '' } }),
      mint({ header: { typ: 'at+jwt' } }),
      mint({ header: { crit: ['exp'] } }),
      `${mint()}.extra`,
      mint().replace('.', '.+/'),
      '',
    ]) {
      await expect(verifier.verify(body, hdr(jwt), [CANDIDATE])).resolves.toBeNull()
    }
    await expect(verifier.verify(body, {}, [CANDIDATE])).resolves.toBeNull()
  })

  it('refetches once on an unknown kid (key rotation) and then verifies', async () => {
    const { verifier, fetchMock } = setup(
      [
        okResponse(jwksBody(jwk(other.publicKey, 'old-kid'))),
        okResponse(jwksBody(jwk(other.publicKey, 'old-kid'), jwk(publicKey, KID))),
      ],
      { refetchCooldownMs: 0 },
    )
    // Prime the cache with the old set.
    await verifier.verify(body, hdr(mint({ header: { kid: 'old-kid' }, key: other.privateKey })), [
      CANDIDATE,
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.toEqual({
      connectionId: 'c1',
      bodyAuthenticated: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not refetch for unknown kids within the cooldown', async () => {
    const { verifier, fetchMock, clock } = setup(undefined, { refetchCooldownMs: 30_000 })
    await verifier.verify(body, hdr(mint()), [CANDIDATE])
    for (let i = 0; i < 5; i++) {
      await expect(
        verifier.verify(body, hdr(mint({ header: { kid: `invented-${i}` } })), [CANDIDATE]),
      ).resolves.toBeNull()
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    clock.t += 30_000
    await verifier.verify(
      body,
      hdr(
        mint({
          header: { kid: 'invented-x' },
          claims: { exp: Math.floor(clock.t / 1000) + 60, iat: Math.floor(clock.t / 1000) },
        }),
      ),
      [CANDIDATE],
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails closed when the JWKS fetch fails (network error, HTTP 500, bad JSON, oversized)', async () => {
    for (const r of [
      new Error('ECONNRESET'),
      new Response('nope', { status: 500 }),
      okResponse('not json'),
      okResponse(JSON.stringify({ keys: [], pad: 'x'.repeat(70_000) })),
    ]) {
      const { verifier } = setup([r])
      await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.toBeNull()
    }
  })

  it('does not use expired cached keys when the refresh fails', async () => {
    const { verifier, clock } = setup(
      [okResponse(jwksBody(jwk(publicKey, KID))), new Error('down')],
      { jwksTtlMs: 1000, refetchCooldownMs: 0 },
    )
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.not.toBeNull()
    clock.t += 2000
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.toBeNull()
  })

  it('skips JWKS keys that are not RSA signing keys, or are too short', async () => {
    const small = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const cases: Array<[Record<string, unknown>, KeyObject]> = [
      [{ ...jwk(publicKey, KID), alg: 'RS512' }, privateKey],
      [{ ...jwk(publicKey, KID), use: 'enc' }, privateKey],
      [{ ...jwk(publicKey, KID), kty: 'oct', k: 'c2VjcmV0' }, privateKey],
      [jwk(small.publicKey, KID), small.privateKey],
    ]
    for (const [k, signer] of cases) {
      const { verifier } = setup([okResponse(jwksBody(k))])
      await expect(
        verifier.verify(body, hdr(mint({ key: signer })), [CANDIDATE]),
      ).resolves.toBeNull()
    }
    // Control: the same key set with a usable key verifies.
    const { verifier } = setup([okResponse(jwksBody(jwk(publicKey, KID)))])
    await expect(verifier.verify(body, hdr(mint()), [CANDIDATE])).resolves.not.toBeNull()
  })

  it('rejects an expired token (seconds) and accepts inside the clock skew', async () => {
    const { verifier } = setup(undefined, { clockSkewMs: 60_000 })
    const s = Math.floor(NOW / 1000)
    await expect(
      verifier.verify(body, hdr(mint({ claims: { iat: s - 400, exp: s - 61 } })), [CANDIDATE]),
    ).resolves.toBeNull()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { iat: s - 400, exp: s - 30 } })), [CANDIDATE]),
    ).resolves.not.toBeNull()
  })

  it('accepts exp/iat in milliseconds as the claim list says, and rejects them expired', async () => {
    const { verifier } = setup(undefined, { clockSkewMs: 0 })
    await expect(
      verifier.verify(body, hdr(mint({ claims: { iat: NOW, exp: NOW + 179_000 } })), [CANDIDATE]),
    ).resolves.not.toBeNull()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { iat: NOW - 200_000, exp: NOW - 1 } })), [
        CANDIDATE,
      ]),
    ).resolves.toBeNull()
  })

  it('rejects iat in the future, iat after exp, and missing or non-integer times', async () => {
    const { verifier } = setup(undefined, { clockSkewMs: 60_000 })
    const s = Math.floor(NOW / 1000)
    for (const claims of [
      { iat: s + 120, exp: s + 300 },
      { iat: s + 10, exp: s + 5 },
      { iat: undefined },
      { exp: undefined },
      { exp: String(s + 100) },
      { exp: s + 100.5 },
      { iat: 0 },
    ]) {
      await expect(verifier.verify(body, hdr(mint({ claims })), [CANDIDATE])).resolves.toBeNull()
    }
  })

  it('rejects a token for another org (iss) and fetches nothing', async () => {
    const { verifier, fetchMock } = setup()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { iss: 'orgId:12345' } })), [CANDIDATE]),
    ).resolves.toBeNull()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { iss: ORG } })), [CANDIDATE]),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a token for another webhook (aud) of the same org', async () => {
    const { verifier } = setup()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { aud: 'webhookId:1' } })), [CANDIDATE]),
    ).resolves.toBeNull()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { aud: HOOK } })), [CANDIDATE]),
    ).resolves.toBeNull()
  })

  it('accepts aud as an array containing the webhook', async () => {
    const { verifier } = setup()
    await expect(
      verifier.verify(body, hdr(mint({ claims: { aud: ['x', `webhookId:${HOOK}`] } })), [
        CANDIDATE,
      ]),
    ).resolves.not.toBeNull()
  })

  it('refuses when no webhookId is stored for the connection', async () => {
    const { verifier } = setup()
    const { webhookSecret: _omit, ...noHook } = CANDIDATE
    await expect(verifier.verify(body, hdr(mint()), [noHook])).resolves.toBeNull()
  })

  it('also reads the webhookId from extra.webhookRegistrationId', async () => {
    const { verifier } = setup()
    const c: WebhookVerificationCandidate = {
      connectionId: 'c9',
      extra: { dataCentre: 'us', orgId: ORG, webhookRegistrationId: HOOK },
    }
    await expect(verifier.verify(body, hdr(mint()), [c])).resolves.toMatchObject({
      connectionId: 'c9',
    })
  })

  it('picks the one matching connection among several, and refuses an ambiguous match', async () => {
    const { verifier } = setup()
    const others: WebhookVerificationCandidate[] = [
      { connectionId: 'a', extra: { dataCentre: 'us', orgId: '1' }, webhookSecret: HOOK },
      { connectionId: 'b', extra: { dataCentre: 'us', orgId: ORG }, webhookSecret: '42' },
    ]
    await expect(verifier.verify(body, hdr(mint()), [...others, CANDIDATE])).resolves.toMatchObject(
      {
        connectionId: 'c1',
      },
    )
    await expect(
      verifier.verify(body, hdr(mint()), [CANDIDATE, { ...CANDIDATE, connectionId: 'dup' }]),
    ).resolves.toBeNull()
  })

  it("fetches the connection's own data-centre JWKS first, then the documented URL", async () => {
    const { verifier, fetchMock } = setup([
      okResponse(jwksBody(jwk(other.publicKey, 'eu-kid'))),
      okResponse(jwksBody(jwk(publicKey, KID))),
    ])
    const eu = { ...CANDIDATE, extra: { dataCentre: 'eu', orgId: ORG } }
    await expect(verifier.verify(body, hdr(mint()), [eu])).resolves.not.toBeNull()
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://desk.zoho.eu/.well-known/jwks.json',
      DOCUMENTED_JWKS_URL,
    ])
  })

  it('refuses a candidate whose data centre is not in the fixed table', async () => {
    const { verifier, fetchMock } = setup()
    const evil = { ...CANDIDATE, extra: { dataCentre: 'attacker.example', orgId: ORG } }
    await expect(verifier.verify(body, hdr(mint()), [evil])).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never takes a key location from the token', async () => {
    const { verifier, fetchMock } = setup()
    await verifier.verify(
      body,
      hdr(
        mint({ header: { jku: 'https://attacker.example/jwks.json', x5u: 'https://x.example' } }),
      ),
      [CANDIDATE],
    )
    for (const [url] of fetchMock.mock.calls) expect(url).toBe(DOCUMENTED_JWKS_URL)
  })

  it('jwksUrlsFor and claimTimeMs', () => {
    expect(jwksUrlsFor('us')).toEqual([DOCUMENTED_JWKS_URL])
    expect(jwksUrlsFor('CA')).toEqual([
      'https://desk.zohocloud.ca/.well-known/jwks.json',
      DOCUMENTED_JWKS_URL,
    ])
    expect(() => jwksUrlsFor('cn')).toThrow()
    expect(claimTimeMs(1692280327)).toBe(1692280327000)
    expect(claimTimeMs(1692280327000)).toBe(1692280327000)
    expect(claimTimeMs(-1)).toBeNull()
    expect(claimTimeMs('1692280327')).toBeNull()
  })
})

describe('zoho-desk synchronous verifier stays closed', () => {
  it('rejects every delivery, even a correctly signed one', () => {
    expect(verifyZohoDeskWebhook(body, hdr(mint()), HOOK)).toBe(false)
    expect(verifyZohoDeskWebhook(body, {}, '')).toBe(false)
    const adapter = new ZohoDeskAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
    expect(adapter.verifyWebhook(body, hdr(mint()), HOOK)).toBe(false)
  })

  it('the registered handler carries the async verifier', () => {
    const handler = WEBHOOK_HANDLERS['zoho-desk']
    expect(handler).toBeDefined()
    expect(typeof handler!.verifyWebhookWithContext).toBe('function')
    expect(handler!.verifyWebhook(body, hdr(mint()), HOOK)).toBe(false)
  })
})

/** Shape of the documented Ticket_Add sample, trimmed. */
const TICKET_ADD = [
  {
    payload: { id: '31138000011967402', subject: 'Ticket add Event', statusType: 'Open' },
    eventTime: '1618490724000',
    eventType: 'Ticket_Add',
    orgId: ORG,
  },
]

describe('zoho-desk webhook through the unified router', () => {
  let handle: DbHandle
  let fastify: FastifyInstance

  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  async function mount(handler: WebhookHandler, consume: (input: unknown) => Promise<void>) {
    handle = await openDb({ sqlitePath: ':memory:' })
    const store = await CredentialStore.create(handle, 'webhook-test-secret-must-be-32-chars-long')
    fastify = Fastify({ logger: false })
    await fastify.register(
      createUnifiedWebhooksRouter({
        handlers: { 'customer-support': { 'zoho-desk': handler } },
        store,
        config: { adapters: { 'customer-support': { 'zoho-desk': { secret: 'configured' } } } },
        consumer: { consume },
      }),
    )
    await fastify.ready()
    return store
  }

  const post = (jwt: string, payload: unknown = TICKET_ADD) =>
    fastify.inject({
      method: 'POST',
      url: '/webhooks/customer-support/zoho-desk',
      headers: { 'content-type': 'application/json', 'X-ZDesk-JWT': jwt },
      payload: JSON.stringify(payload),
    })

  async function connect(store: CredentialStore, orgId: string, hook?: string) {
    const id = await store.create(
      'zoho-desk',
      orgId,
      { accessToken: 'a', tenantId: orgId, extra: { dataCentre: 'us', orgId } },
      `conn-${orgId}`,
      'customer-support',
    )
    if (hook) await store.setWebhookSecret(id, hook)
    return id
  }

  // Router-level tests run on real time, so the token is minted for now.
  const mintNow = (claims: Record<string, unknown> = {}) => {
    const s = Math.floor(Date.now() / 1000)
    return mint({ claims: { iat: s, exp: s + 179, ...claims } })
  }

  function handlerWithMockedJwks() {
    const fetchMock = vi.fn(async () => okResponse(jwksBody(jwk(publicKey, KID))))
    return createZohoDeskWebhookHandler(
      createZohoDeskJwtVerifier({ fetch: fetchMock as unknown as typeof fetch }),
    )
  }

  it('200: a valid delivery reaches the named connection, without the body', async () => {
    const consume = vi.fn(async (_input: unknown) => undefined)
    const store = await mount(handlerWithMockedJwks(), consume)
    await connect(store, '1', HOOK)
    const id = await connect(store, ORG, HOOK)
    const res = await post(mintNow())
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true, eventCount: 1 })
    expect(consume).toHaveBeenCalledTimes(1)
    const input = consume.mock.calls[0]![0] as Record<string, unknown>
    expect(input).toMatchObject({
      vertical: 'customer-support',
      platform: 'zoho-desk',
      connectionId: id,
      bodyAuthenticated: false,
      event: {
        type: 'Ticket_Add',
        resourceType: 'tickets',
        action: 'created',
        resourceId: '31138000011967402',
        payload: { bodyVerified: false },
      },
    })
    expect(JSON.stringify((input['event'] as Record<string, unknown>)['payload'])).not.toContain(
      'Ticket add Event',
    )
  })

  it('a body-supplied externalAccountId cannot redirect the event to another connection', async () => {
    const consume = vi.fn(async (_input: unknown) => undefined)
    const base = handlerWithMockedJwks()
    const handler: WebhookHandler = {
      ...base,
      parseWebhookEvents: (p) =>
        parseZohoDeskWebhookEvents(p).map((e) => ({ ...e, externalAccountId: 'victim' })),
    }
    const store = await mount(handler, consume)
    const victim = await connect(store, '777', '1')
    await store.linkExternalAccount('zoho-desk', 'victim', victim, 'customer-support')
    const id = await connect(store, ORG, HOOK)
    const res = await post(mintNow())
    expect(res.statusCode).toBe(200)
    expect((consume.mock.calls[0]![0] as { connectionId: string }).connectionId).toBe(id)
  })

  it('401: wrong aud, no stored webhookId, or no token, and nothing is consumed', async () => {
    const consume = vi.fn(async (_input: unknown) => undefined)
    const store = await mount(handlerWithMockedJwks(), consume)
    await connect(store, ORG)
    for (const jwt of [mintNow(), mintNow({ aud: 'webhookId:1' }), '']) {
      const res = await post(jwt)
      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ error: { code: 'INVALID_WEBHOOK_SIGNATURE' } })
    }
    expect(consume).not.toHaveBeenCalled()
  })

  it('401 when the JWKS cannot be fetched', async () => {
    const consume = vi.fn(async (_input: unknown) => undefined)
    const handler = createZohoDeskWebhookHandler(
      createZohoDeskJwtVerifier({
        fetch: vi.fn(async () => {
          throw new Error('down')
        }) as unknown as typeof fetch,
      }),
    )
    const store = await mount(handler, consume)
    await connect(store, ORG, HOOK)
    expect((await post(mintNow())).statusCode).toBe(401)
    expect(consume).not.toHaveBeenCalled()
  })
})

describe('zoho-desk webhook parsing', () => {
  it('reads the documented array body, one event per element, without passing the body on', () => {
    const events = parseZohoDeskWebhookEvents([
      ...TICKET_ADD,
      {
        payload: { id: '123456789022' },
        eventTime: '1500278817335',
        eventType: 'Contact_Delete',
        orgId: '3981311',
      },
    ] as unknown as Record<string, unknown>)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      id: 'zoho-desk:Ticket_Add:31138000011967402:1618490724000',
      platform: 'zoho-desk',
      type: 'Ticket_Add',
      resourceType: 'tickets',
      action: 'created',
      resourceId: '31138000011967402',
      ticketId: undefined,
    })
    expect(events[0]!.payload).toEqual({ bodyVerified: false })
    expect(events[1]).toMatchObject({
      type: 'Contact_Delete',
      resourceType: 'contacts',
      action: 'deleted',
      resourceId: '123456789022',
    })
    for (const e of events) expect(() => WebhookEventSchema.parse(e)).not.toThrow()
  })

  it('takes ticketId from thread and comment payloads', () => {
    const [thread, comment] = parseZohoDeskWebhookEvents([
      {
        payload: { id: '31138000011974105', ticketId: '31138000011972149' },
        eventTime: '1618496809696',
        eventType: 'Ticket_Thread_Add',
        orgId: '54983163',
      },
      {
        payload: { id: '31138000011974070', ticketId: '31138000011972149' },
        eventTime: '1618495612880',
        eventType: 'Ticket_Comment_Add',
        orgId: '54983163',
      },
    ] as unknown as Record<string, unknown>)
    expect(thread).toMatchObject({
      resourceType: 'messages',
      action: 'created',
      resourceId: '31138000011974105',
      ticketId: '31138000011972149',
    })
    expect(comment).toMatchObject({
      resourceType: 'messages',
      action: 'commented',
      ticketId: '31138000011972149',
    })
  })

  it('maps agent events to users and leaves other documented types unknown', () => {
    const [agent, account] = parseZohoDeskWebhookEvents([
      { payload: { id: '123456789011' }, eventTime: '1', eventType: 'Agent_Delete' },
      { payload: { id: '9' }, eventTime: '2', eventType: 'Account_Add' },
    ] as unknown as Record<string, unknown>)
    expect(agent).toMatchObject({ resourceType: 'users', action: 'deleted' })
    expect(account).toMatchObject({
      type: 'Account_Add',
      resourceType: 'unknown',
      action: 'unknown',
    })
  })

  it('accepts a bare event object and ignores the removed Zendesk shape', () => {
    const [bare] = parseZohoDeskWebhookEvents(TICKET_ADD[0]!)
    expect(bare).toMatchObject({ resourceType: 'tickets', action: 'created' })
    const [zendesk] = parseZohoDeskWebhookEvents({
      type: 'zen:event-type:ticket.created',
      detail: { id: 't1' },
    })
    expect(zendesk).toMatchObject({ resourceType: 'unknown', action: 'unknown', resourceId: '' })
  })
})
