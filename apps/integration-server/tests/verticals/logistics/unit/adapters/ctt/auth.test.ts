/**
 * CTT authentication and getTrackingEvents.
 *
 * The adapter sent `Authorization: Bearer <apiKey>` to api.ctt.pt/v1. The
 * documented scheme (https://api.pakketmail.nl/v3/apidocs/usa/authenticate)
 * is HTTP Basic with the token as username and an HMAC-SHA256 of token + body
 * as password, a token from POST /keys/ under the public key, and the X-APPID
 * application key header (https://api.pakketmail.nl/v3/apidocs/usa/using).
 *
 * getTrackingEvents used GET tracking/{n}; tracking is POST /tracking/ with
 * TrackingIdList (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/tracking/POST).
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { _resetRowPager } from '@opensteward/shared'
import { CttAdapter } from '../../../../../../src/verticals/logistics/adapters/ctt/index'
import { hmacPassword } from '../../../../../../src/verticals/logistics/adapters/ctt/auth'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { TRACKING_REPLY } from './fixtures'
import { credsFor, fakeCtt, keysFor } from './fake'

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () => new CttAdapter({ newsinceIntervalMs: 0 })

describe('ctt auth', () => {
  it('hashes user + body with the secret, base64 without padding', () => {
    // HMAC-SHA256("TOKEN-1", "SECRET-1") computed independently.
    const pw = hmacPassword('TOKEN-1', '', 'SECRET-1')
    expect(pw).not.toMatch(/=$/)
    expect(pw).toBe(
      createHmac('sha256', 'SECRET-1').update('TOKEN-1').digest('base64').replace(/=+$/, ''),
    )
  })

  it('exchangeCredentials requests a token with the public key and stores the four keys', async () => {
    const keys = keysFor('PUB-auth-1')
    const fake = fakeCtt(keys, { issue: 'TOKEN-9' })
    const creds = await adapter().exchangeCredentials({ ...keys })
    expect(creds.accessToken).toBe('TOKEN-9')
    expect(creds.expiresAt).toEqual(new Date('2026-12-31'))
    expect(creds.extra).toEqual({ ...keys })
    expect(fake.tokenRequests).toEqual([
      { body: { PlatformVersion: '1', PluginVersion: '1', ShopUrl: keys.shopUrl } },
    ])
  })

  it('exchangeCredentials refuses a missing field before any request', async () => {
    const keys = keysFor('PUB-auth-2')
    const fake = fakeCtt(keys)
    await expect(adapter().exchangeCredentials({ ...keys, secretKey: '' })).rejects.toThrow(
      /Secret key/,
    )
    expect(fake.post).not.toHaveBeenCalled()
  })

  it('an expired token is renewed before the request', async () => {
    const keys = keysFor('PUB-auth-3')
    const fake = fakeCtt(keys, { validTokens: [], issue: 'TOKEN-NEW' })
    await adapter().listCarriers(credsFor(keys, 'TOKEN-OLD', new Date('2020-01-01')), {
      page: 1,
      limit: 5,
    })
    expect(fake.tokenRequests).toHaveLength(1)
    expect(fake.request).toHaveBeenCalledTimes(1)
  })

  it('a 401 renews the token and redoes the request once', async () => {
    const keys = keysFor('PUB-auth-4')
    const fake = fakeCtt(keys, { validTokens: [], issue: 'TOKEN-NEW' })
    await adapter().listCarriers(credsFor(keys, 'TOKEN-REVOKED'), { page: 1, limit: 5 })
    expect(fake.tokenRequests).toHaveLength(1)
    expect(fake.request).toHaveBeenCalledTimes(2)
  })

  it('a connection without the four keys must reconnect: 401, no request', async () => {
    const keys = keysFor('PUB-auth-5')
    const fake = fakeCtt(keys)
    await expect(
      adapter().listCarriers({ accessToken: 'old-bearer-key' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(fake.request).not.toHaveBeenCalled()
  })

  it('exchangeCode refuses: CTT has no authorization-code flow', async () => {
    const keys = keysFor('PUB-auth-7')
    const fake = fakeCtt(keys)
    await expect(adapter().exchangeCode('code', 'https://x.test/cb')).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION',
    })
    expect(fake.post).not.toHaveBeenCalled()
    expect(fake.create).not.toHaveBeenCalled()
  })

  it('refreshCredentials fetches a new token and keeps the keys', async () => {
    const keys = keysFor('PUB-auth-6')
    fakeCtt(keys, { issue: 'TOKEN-R' })
    const out = await adapter().refreshCredentials(
      credsFor(keys, 'TOKEN-1', new Date('2020-01-01')),
    )
    expect(out).toMatchObject({ accessToken: 'TOKEN-R', extra: { ...keys } })
  })
})

describe('ctt getTrackingEvents', () => {
  it('POSTs tracking/ with TrackingIdList, the body hashed as sent, and maps the reply', async () => {
    const keys = keysFor('PUB-trk-1')
    const fake = fakeCtt(keys, { tracking: TRACKING_REPLY })
    const events = await adapter().getTrackingEvents(credsFor(keys), 'EA123456789PT')
    expect(fake.sent).toEqual([
      {
        method: 'POST',
        url: 'tracking/',
        data: JSON.stringify({ TrackingIdList: ['EA123456789PT'] }),
      },
    ])
    expect(events.map((e) => TrackingEventSchema.parse(e).status)).toEqual([
      'PRE_TRANSIT',
      'IN_TRANSIT',
      'DELIVERED',
    ])
  })

  it('returns no events, not a synthetic one, when the reply has none', async () => {
    const keys = keysFor('PUB-trk-2')
    fakeCtt(keys, { tracking: { Shipments: {} } })
    expect(await adapter().getTrackingEvents(credsFor(keys), 'X')).toEqual([])
  })
})
