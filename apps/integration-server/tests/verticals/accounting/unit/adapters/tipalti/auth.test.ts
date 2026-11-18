/**
 * Tipalti Connect Link auth (client credentials), from the first-party docs
 * fetched 2026-09-28:
 *
 *   reference/step-1-retrieve-access-token:
 *     POST https://sso.tipalti.com/connect/token (sandbox: sso.sandbox.tipalti.com)
 *     application/x-www-form-urlencoded: client_id, client_secret,
 *     grant_type=client_credentials, scope (space-separated)
 *     → { access_token, expires_in: 3600, token_type: "Bearer", scope }
 *   reference/access-scopes: every scope is tipalti.api.<resource>.<read|write>;
 *     there is no bare `tipalti.api` scope.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { TipaltiAdapter } from '../../../../../../src/verticals/accounting/adapters/tipalti/index'
import { PLATFORMS } from '../../../../../../src/verticals/accounting/platforms/metadata'

afterEach(() => {
  vi.restoreAllMocks()
})

const TOKEN = { access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }

describe('Tipalti auth', () => {
  it('is labelled session, so connect shows the client-credentials form', () => {
    expect(PLATFORMS.find((p) => p.slug === 'tipalti')?.auth_type).toBe('session')
  })

  it('mints a production token with documented params and scopes', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await new TipaltiAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'secret',
      environment: 'production',
    })
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://sso.tipalti.com/connect/token')
    expect((config?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    const params = new URLSearchParams(body as string)
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('cid')
    expect(params.get('client_secret')).toBe('secret')
    const scopes = (params.get('scope') ?? '').split(' ')
    expect(scopes.length).toBeGreaterThan(0)
    for (const s of scopes) expect(s).toMatch(/^tipalti\.api\.[a-z-]+\.(read|write)$/)
    expect(scopes).not.toContain('tipalti.api')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toMatchObject({
      clientId: 'cid',
      clientSecret: 'secret',
      environment: 'production',
    })
  })

  it('uses the sandbox token endpoint for sandbox', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await new TipaltiAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'secret',
      environment: 'sandbox',
    })
    expect(post.mock.calls[0]![0]).toBe('https://sso.sandbox.tipalti.com/connect/token')
  })

  it('re-mints from stored client credentials on refresh', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { ...TOKEN, access_token: 'new' } })
    const creds = await new TipaltiAdapter().refreshCredentials({
      accessToken: 'old',
      extra: { clientId: 'cid', clientSecret: 'secret', environment: 'production' },
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(creds.accessToken).toBe('new')
  })
})
