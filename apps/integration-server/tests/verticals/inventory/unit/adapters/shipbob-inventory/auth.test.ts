import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipBobInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/index'
import { buildAuthUrl } from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/auth'
import { DEFAULT_SCOPES } from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/constants'
import type { Credentials } from '../../../../../../src/verticals/inventory/adapter/interface'

/**
 * This adapter took a ShipBob Personal Access Token and nothing else:
 * `getAuthUrl` threw, so the Connect Link offered a password box and an
 * operator had to paste a token that expires with no way to renew it.
 *
 * The OAuth flow itself is ShipBob's, and it is not a stock one — the
 * provider rewrites `response_type`, runs two independent IdentityServer
 * environments, and documents PKCE as required. All of that lives in
 * `verticals/shared/shipbob-oauth.ts` so this adapter and `logistics/shipbob`
 * cannot drift apart on it; what is asserted here is the part this adapter
 * decides for itself — which environment, which scopes, and that a PAT
 * connection made before any of this existed still works.
 */

const CFG = {
  clientId: 'ExternalApplication_ae705999',
  clientSecret: 'shh',
  redirectUri: 'http://localhost:3010/auth/inventory/shipbob-inventory/callback',
}

const TOKEN_RESPONSE = {
  access_token: 'fresh-access',
  refresh_token: 'fresh-refresh',
  expires_in: 3600,
  scope: 'products_read',
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

function stubToken() {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN_RESPONSE } as never)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the authorize URL', () => {
  it('points at ShipBob’s IdentityServer authorize endpoint', () => {
    expect(buildAuthUrl(CFG, 'state-1')).toMatch(
      /^https:\/\/auth\.shipbob\.com\/connect\/authorize\?/,
    )
  })

  it('uses the staging IdentityServer when sandbox is set', () => {
    // An app exists in exactly one environment; the wrong one is refused with
    // a page that names no cause. Measured in logistics/shipbob against one
    // identical client_id: auth.shipbob.com 302 -> /home/error, and
    // authstage.shipbob.com 302 -> /Account/Login.
    expect(buildAuthUrl({ ...CFG, sandbox: true }, 's')).toMatch(
      /^https:\/\/authstage\.shipbob\.com\//,
    )
  })

  it('carries code_challenge and S256 when a challenge is supplied', () => {
    const p = paramsOf(buildAuthUrl(CFG, 'state-1', 'CHALLENGE'))
    expect(p.get('code_challenge')).toBe('CHALLENGE')
    expect(p.get('code_challenge_method')).toBe('S256')
  })

  it('asks for form_post, because a fragment never reaches the callback', () => {
    // ShipBob rewrites response_type into `code id_token` server-side, and a
    // hybrid response defaults to response_mode=fragment. The callback then
    // fires with no code and no state.
    expect(paramsOf(buildAuthUrl(CFG, 's')).get('response_mode')).toBe('form_post')
  })
})

describe('the scopes this adapter requests', () => {
  it('covers every route it reads', () => {
    // /product, /inventory-level/locations and /receiving. Nothing else is
    // called, so nothing else is asked for.
    expect(DEFAULT_SCOPES).toContain('products_read')
    expect(DEFAULT_SCOPES).toContain('inventory_read')
    expect(DEFAULT_SCOPES).toContain('receiving_read')
  })

  it('asks for offline_access, or the connection cannot outlive the token', () => {
    // Without it ShipBob issues no refresh token and the connection dies the
    // way the PAT one did — an unexplained 401 on every resource.
    expect(DEFAULT_SCOPES).toContain('offline_access')
  })

  it('does not ask for locations_read', () => {
    // The adapter reads /fulfillment-center, not /location, precisely so it
    // does not need this scope: /location returns ShipBob's whole 69-centre
    // network, 65 of them access_granted: false. Asking for a scope the
    // adapter has no route for is a permission the merchant grants for
    // nothing.
    expect(DEFAULT_SCOPES).not.toContain('locations_read')
  })

  it('requests only scopes ShipBob publishes', () => {
    const documented = new Set([
      'billing_read', 'channels_read', 'fulfillments_read', 'fulfillments_write',
      'inventory_read', 'inventory_write', 'locations_read', 'locations_write',
      'orders_read', 'orders_write', 'pricing_read', 'products_read',
      'products_write', 'receiving_read', 'receiving_write', 'returns_read',
      'returns_write', 'webhooks_read', 'webhooks_write', 'offline_access',
    ])
    expect(DEFAULT_SCOPES.filter((s) => !documented.has(s))).toEqual([])
  })

  it('honours a per-call scope override', () => {
    // This is what a read_only Connect Link sends.
    const url = new ShipBobInventoryAdapter(CFG).getAuthUrl('s', ['products_read'], 'CHALLENGE')
    expect(paramsOf(url).get('scope')).toBe('products_read')
  })
})

describe('the adapter declares what the flow needs', () => {
  it('declares requiresPkce, which is what makes the router mint a pair', () => {
    expect(new ShipBobInventoryAdapter().capabilities?.requiresPkce).toBe(true)
  })

  it('declares supportsSandbox', () => {
    expect(new ShipBobInventoryAdapter().capabilities?.supportsSandbox).toBe(true)
  })

  it('implements exchangeCodeWithVerifier', () => {
    // An adapter declaring requiresPkce without it authorizes fine and then
    // fails the exchange.
    expect(typeof new ShipBobInventoryAdapter().exchangeCodeWithVerifier).toBe('function')
  })

  it('threads sandbox from adapter config through to the URL', () => {
    expect(new ShipBobInventoryAdapter({ ...CFG, sandbox: true }).getAuthUrl('s')).toMatch(
      /^https:\/\/authstage\.shipbob\.com\//,
    )
  })
})

describe('exchangeCode', () => {
  it('returns the tokens ShipBob issued', async () => {
    stubToken()
    const out = await new ShipBobInventoryAdapter(CFG).exchangeCode('code-1', CFG.redirectUri)
    expect(out.accessToken).toBe('fresh-access')
    expect(out.refreshToken).toBe('fresh-refresh')
    expect(out.expiresAt).toBeInstanceOf(Date)
  })

  it('sends the verifier that matches the challenge', async () => {
    const post = stubToken()
    await new ShipBobInventoryAdapter(CFG).exchangeCodeWithVerifier!(
      'code-1',
      CFG.redirectUri,
      'VERIFIER',
    )
    const body = new URLSearchParams(post.mock.calls[0]![1] as string)
    expect(body.get('code_verifier')).toBe('VERIFIER')
    expect(body.get('grant_type')).toBe('authorization_code')
  })

  it('resolves no channel', async () => {
    // logistics/shipbob looks up GET /channel at exchange to fill the
    // shipbob_channel_id header. This adapter deliberately never sends that
    // header — on a read it filters the response to the one channel our
    // application created, which cost logistics/shipbob every order on a real
    // account. Looking the channel up anyway would spend a request on
    // a value nothing reads, and park an id in `extra` that implies a scoping
    // this adapter does not do.
    const post = stubToken()
    const get = vi.spyOn(axios, 'get')
    await new ShipBobInventoryAdapter(CFG).exchangeCode('code-1', CFG.redirectUri)
    expect(post).toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('refreshCredentials', () => {
  function connected(overrides: Partial<Credentials> = {}): Credentials {
    return {
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      extra: { installedAt: '2026-09-18' },
      ...overrides,
    }
  }

  it('replaces the token fields with the ones just issued', async () => {
    stubToken()
    const out = await new ShipBobInventoryAdapter(CFG).refreshCredentials(connected())
    expect(out.accessToken).toBe('fresh-access')
    expect(out.refreshToken).toBe('fresh-refresh')
    expect(out.scope).toBe('products_read')
  })

  it('carries extra and webhookSecret through the refresh', async () => {
    // The return value REPLACES the stored blob wholesale
    // (refreshWithRotationGuard -> store.updateById), so a field missing here
    // is a field deleted from the database. For this adapter that is the
    // per-connection webhook secret: losing it fails every subsequent
    // signature check.
    stubToken()
    const creds = connected({ webhookSecret: 'whsec_per_connection' })
    const out = await new ShipBobInventoryAdapter(CFG).refreshCredentials(creds)
    expect(out.extra).toEqual({ installedAt: '2026-09-18' })
    expect(out.webhookSecret).toBe('whsec_per_connection')
  })

  it('keeps the old refresh token when the response omits one', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { ...TOKEN_RESPONSE, refresh_token: undefined },
    } as never)
    const out = await new ShipBobInventoryAdapter(CFG).refreshCredentials(connected())
    expect(out.refreshToken).toBe('stale-refresh')
  })

  it('leaves a PAT connection alone', async () => {
    // Every connection made before OAuth existed holds an access token and no
    // refresh token. A PAT does not expire on a schedule and there is nothing
    // to exchange; posting to the token endpoint would 400 and, worse, the
    // failure would be recorded against a credential that still works.
    const post = stubToken()
    const pat = connected({ refreshToken: undefined })
    const out = await new ShipBobInventoryAdapter(CFG).refreshCredentials(pat)
    expect(post).not.toHaveBeenCalled()
    expect(out).toEqual(pat)
  })
})

describe('the PAT path survives', () => {
  it('still offers the API key field', async () => {
    // auth_type flips to oauth2, so the Connect Link tile becomes an OAuth
    // one — but the headless credential route still serves an operator
    // pasting a token, and the existing sandbox connection was made that way.
    const fields = new ShipBobInventoryAdapter().credentialFields()
    expect(fields.map((f) => f.name)).toEqual(['apiKey'])
  })

  it('still exchanges a pasted key for credentials', async () => {
    const out = await new ShipBobInventoryAdapter().exchangeCredentials!({ apiKey: 'pat-123' })
    expect(out.accessToken).toBe('pat-123')
  })
})
