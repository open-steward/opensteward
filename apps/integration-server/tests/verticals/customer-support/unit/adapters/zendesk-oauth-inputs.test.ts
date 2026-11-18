/**
 * Zendesk OAuth is per-account: authorize, token and API all live on
 * `{subdomain}.zendesk.com`. The adapter asked for the subdomain through
 * `credentialFields()` — which the Connect page renders only for NON-OAuth
 * adapters — so an OAuth customer was never asked. `getAuthUrl` then sent
 * them to the literal host `subdomain.zendesk.com`, and `exchangeCode` posted
 * the client secret to `https://.zendesk.com/oauth/tokens`.
 *
 * The subdomain is now an `oauthField`, collected before the redirect and
 * replayed at exchange; the API client reads it back from
 * `credentials.extra.tenantSubdomain`, as it always did.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ZendeskAdapter } from '../../../../../src/verticals/customer-support/adapters/zendesk/index'
import { normaliseSubdomain } from '../../../../../src/verticals/customer-support/adapters/zendesk/auth'

const CFG = {
  clientId: 'zd-client',
  clientSecret: 'zd-secret',
  redirectUri: 'http://localhost:3010/auth/customer-support/zendesk/callback',
}

afterEach(() => vi.restoreAllMocks())

describe('normaliseSubdomain', () => {
  it.each([
    ['acme', 'acme'],
    ['acme.zendesk.com', 'acme'],
    ['https://acme.zendesk.com/agent/tickets/1', 'acme'],
    ['  ACME.Zendesk.com ', 'acme'],
  ])('%s → %s', (input, want) => {
    expect(normaliseSubdomain(input)).toBe(want)
  })

  it('rejects a blank with a message naming what is missing', () => {
    // The exact message: `/subdomain/i` also matched "normaliseSubdomain is not
    // a function", so this case passed before the function existed.
    expect(() => normaliseSubdomain('')).toThrow(/Zendesk subdomain is required/)
    expect(() => normaliseSubdomain(undefined)).toThrow(/Zendesk subdomain is required/)
  })

  it('rejects hosts outside zendesk.com — the client secret is posted there', () => {
    expect(() => normaliseSubdomain('support.acme.com')).toThrow(/zendesk\.com/)
    expect(() => normaliseSubdomain('acme.zendesk.com.evil.example')).toThrow(/zendesk\.com/)
  })
})

describe('ZendeskAdapter with a per-customer subdomain', () => {
  const adapter = new ZendeskAdapter(CFG)

  it('declares the subdomain as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'tenantSubdomain', required: true, type: 'text' }),
    ])
  })

  it('builds the authorize URL on the customer’s account', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { tenantSubdomain: 'acme.zendesk.com' }),
    )
    expect(u.host).toBe('acme.zendesk.com')
    expect(u.pathname).toBe('/oauth/authorizations/new')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('client_id')).toBe('zd-client')
    expect(u.searchParams.get('response_type')).toBe('code')
  })

  it('refuses to build a URL on the placeholder host when no subdomain was given', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(/Zendesk subdomain is required/)
  })

  it('exchanges on the customer’s account and records the subdomain', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', token_type: 'bearer', scope: 'read' },
    })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      tenantSubdomain: 'Acme',
    })
    expect(post.mock.calls[0]?.[0]).toBe('https://acme.zendesk.com/oauth/tokens')
    expect(creds).toMatchObject({ accessToken: 'tok', extra: { tenantSubdomain: 'acme' } })
  })

  it('never posts the client secret to a hostless URL', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.exchangeCode('code', CFG.redirectUri)).rejects.toThrow(/Zendesk subdomain is required/)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the subdomain stored with the credentials', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .listTickets({ accessToken: 'tok', extra: { tenantSubdomain: 'acme' } }, {})
      .catch(() => undefined) // the request itself is not under test
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://acme.zendesk.com/api/v2')
  })
})
