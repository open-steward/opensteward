import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipBobAdapter } from '../../../../../../src/verticals/logistics/adapters/shipbob/index'
import {
  SHIPBOB_API_BASE,
  SHIPBOB_SANDBOX_API_BASE,
  DEFAULT_APP_NAME,
} from '../../../../../../src/verticals/logistics/adapters/shipbob/constants'

/**
 * `ShipBobClient` sets the `shipbob_channel_id` header from
 * `credentials.extra.channelId`, and nothing ever put a value there — the
 * adapter declared no `oauthFields()` and `exchangeCode` returned only token
 * data. So the header was never sent: reads worked, but channel-scoped writes
 * and `order:estimate` could not.
 *
 * `oauthFields()` is the wrong mechanism for it. Those inputs are collected
 * BEFORE the authorize redirect, and the channel this app will use does not
 * exist until the merchant authorizes the app — ShipBob mints one channel per
 * authorized application. Measured against a live sandbox token, `GET
 * /channel` answers with every channel the account has, one per app:
 *
 *   239465 ShipBob Default   application_name "ShipBob"
 *   239466 PAT Channel       application_name "SMA"
 *   239467 stew stage        application_name "Open Steward"   <- ours
 *   239468 Claude stage      application_name "MCP Public Client"
 *
 * Nothing in the response says which one belongs to the calling token, so the
 * app's own name is the discriminator.
 *
 * Resolution is deliberately non-fatal: a connection that cannot name its
 * channel still reads fine, which is exactly what it does today. Failing the
 * connect would turn a working read-only setup into no setup at all. The
 * candidates are recorded instead, so the ambiguity is visible rather than
 * silent.
 */

const CHANNELS = [
  { id: 239465, name: 'ShipBob Default', application_name: 'ShipBob', scopes: [] },
  { id: 239466, name: 'PAT Channel', application_name: 'SMA', scopes: [] },
  { id: 239467, name: 'stew stage', application_name: 'Open Steward', scopes: [] },
  { id: 239468, name: 'Claude stage', application_name: 'MCP Public Client', scopes: [] },
]

const TOKEN_RESPONSE = {
  access_token: 'fresh-access',
  refresh_token: 'fresh-refresh',
  expires_in: 3600,
  scope: 'orders_read',
}

function stubToken() {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN_RESPONSE } as never)
}

function stubChannels(items: unknown[] = CHANNELS) {
  return vi.spyOn(axios, 'get').mockResolvedValue({ data: { items } } as never)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shipbob channel resolution at connect', () => {
  it('stores the id of the channel belonging to this application', async () => {
    stubToken()
    stubChannels()
    const out = await new ShipBobAdapter({ appName: 'Open Steward' }).exchangeCode(
      'code',
      'https://redirect',
    )
    expect(out.extra?.channelId).toBe('239467')
  })

  it('defaults the application name rather than requiring configuration', async () => {
    stubToken()
    stubChannels()
    const out = await new ShipBobAdapter().exchangeCode('code', 'https://redirect')
    expect(DEFAULT_APP_NAME).toBe('Open Steward')
    expect(out.extra?.channelId).toBe('239467')
  })

  it('resolves on the PKCE exchange too', async () => {
    stubToken()
    stubChannels()
    const out = await new ShipBobAdapter().exchangeCodeWithVerifier(
      'code',
      'https://redirect',
      'verifier',
    )
    expect(out.extra?.channelId).toBe('239467')
  })

  it('asks the environment the token was issued for', async () => {
    stubToken()
    const get = stubChannels()
    await new ShipBobAdapter({ sandbox: true }).exchangeCode('code', 'https://redirect')
    expect(get.mock.calls[0]?.[0]).toBe(`${SHIPBOB_SANDBOX_API_BASE}channel`)

    vi.restoreAllMocks()
    stubToken()
    const prod = stubChannels()
    await new ShipBobAdapter().exchangeCode('code', 'https://redirect')
    expect(prod.mock.calls[0]?.[0]).toBe(`${SHIPBOB_API_BASE}channel`)
  })

  it('records the candidates instead of guessing when nothing matches', async () => {
    stubToken()
    stubChannels()
    const out = await new ShipBobAdapter({ appName: 'Not An App Here' }).exchangeCode(
      'code',
      'https://redirect',
    )
    expect(out.extra?.channelId).toBeUndefined()
    expect(out.extra?.channelCandidates).toEqual([
      { id: '239465', name: 'ShipBob Default', applicationName: 'ShipBob' },
      { id: '239466', name: 'PAT Channel', applicationName: 'SMA' },
      { id: '239467', name: 'stew stage', applicationName: 'Open Steward' },
      { id: '239468', name: 'Claude stage', applicationName: 'MCP Public Client' },
    ])
  })

  it('treats two channels on one application name as ambiguous', async () => {
    stubToken()
    stubChannels([
      { id: 1, name: 'a', application_name: 'Open Steward' },
      { id: 2, name: 'b', application_name: 'Open Steward' },
    ])
    const out = await new ShipBobAdapter().exchangeCode('code', 'https://redirect')
    // Picking the first would send writes to whichever channel ShipBob
    // happened to list first. Better to name neither.
    expect(out.extra?.channelId).toBeUndefined()
    expect(out.extra?.channelCandidates).toHaveLength(2)
  })

  it('still returns usable credentials when the channel lookup fails', async () => {
    stubToken()
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('503 from ShipBob'))
    const out = await new ShipBobAdapter().exchangeCode('code', 'https://redirect')
    // The grant is good; only the channel is unknown. Throwing here would
    // discard a working token over a secondary lookup.
    expect(out.accessToken).toBe('fresh-access')
    expect(out.extra?.channelId).toBeUndefined()
  })

  it('does not re-resolve on refresh', async () => {
    stubToken()
    const get = stubChannels()
    await new ShipBobAdapter().refreshCredentials({
      accessToken: 'old',
      refreshToken: 'r',
      extra: { channelId: '239467' },
    })
    // The stored value is carried through by the refresh itself; re-asking
    // would spend a request per refresh to learn what is already known.
    expect(get).not.toHaveBeenCalled()
  })
})
