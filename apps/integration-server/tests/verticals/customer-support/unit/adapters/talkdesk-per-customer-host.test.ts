/**
 * Talkdesk's OAuth endpoints live on the customer's own account host
 * (`https://{account}.talkdeskid.com`, per region), and the REST API host is
 * per region. Both the account name and the region are the customer's.
 *
 * The adapter read both from deployment config — which the admin UI cannot
 * set — and its `credentialFields()` returned `[]` (and is never called for an
 * oauth2 adapter anyway). A Connect Link authorize URL came out as
 * `https://undefined.talkdeskid.com/oauth/authorize`.
 *
 * Now both are `oauthFields`, normalised and validated, stored in
 * `credentials.extra`, and read back by the token refresh and the API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { TalkdeskAdapter } from '../../../../../src/verticals/customer-support/adapters/talkdesk'
import { normaliseAccountName } from '../../../../../src/verticals/customer-support/adapters/talkdesk/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/customer-support/talkdesk/callback',
}

afterEach(() => {
  vi.restoreAllMocks()
})

function offlineCreate() {
  const fail = () => Promise.reject(new Error('offline'))
  return vi
    .spyOn(axios, 'create')
    .mockReturnValue({ get: fail, post: fail } as never)
}

describe('normaliseAccountName', () => {
  it.each([
    ['acme', 'acme'],
    ['  Acme-Co ', 'acme-co'],
    ['acme.mytalkdesk.com', 'acme'],
    ['https://acme.mytalkdesk.com/atlas/', 'acme'],
    ['acme.talkdeskid.com', 'acme'],
    ['acme.mytalkdesk.eu', 'acme'],
  ])('%s → %s', (input, want) => {
    expect(normaliseAccountName(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseAccountName('  ')).toThrow('Talkdesk account name is required.')
    expect(() => normaliseAccountName(undefined)).toThrow('Talkdesk account name is required.')
  })

  it('rejects hosts outside Talkdesk — the token exchange must not go elsewhere', () => {
    const msg = 'Talkdesk account name must be the name from your {name}.mytalkdesk.com address.'
    expect(() => normaliseAccountName('acme.evil.example')).toThrow(msg)
    expect(() => normaliseAccountName('acme.mytalkdesk.com.evil.example')).toThrow(msg)
    expect(() => normaliseAccountName('ac_me')).toThrow(msg)
  })
})

describe('TalkdeskAdapter per-customer account and region', () => {
  // No accountName in config: that is what a Connect Link deployment has.
  const adapter = new TalkdeskAdapter(CFG as never)

  it('declares the account name and region as oauthFields', () => {
    const fields = adapter.oauthFields()
    expect(fields).toEqual([
      expect.objectContaining({ name: 'accountName', type: 'text', required: true }),
      expect.objectContaining({ name: 'region', type: 'select', required: true }),
    ])
    const regions = (fields[1]!.options ?? []).map((o) => o.value)
    expect(regions).toEqual(expect.arrayContaining(['us', 'eu']))
    // Talkdesk documents a UK API host but no UK identity host to authorize on.
    expect(regions).not.toContain('uk')
  })

  it('builds the authorize URL on the customer’s account host in their region', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { accountName: 'Acme', region: 'eu' }),
    )
    expect(u.host).toBe('acme.talkdeskid.eu')
    expect(u.pathname).toBe('/oauth/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('throws instead of building an undefined host when no account is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Talkdesk account name is required.')
  })

  it('rejects an unknown region before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { accountName: 'acme', region: 'mars' }),
    ).rejects.toThrow('Talkdesk region "mars" is not a recognised region.')
    expect(post).not.toHaveBeenCalled()
  })

  it('exchanges on the account host and stores the normalised values in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', refresh_token: 'rt', token_type: 'bearer', expires_in: 600 },
    })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      accountName: 'https://Acme.mytalkdesk.eu/',
      region: 'EU',
    })
    expect(post.mock.calls[0]![0]).toBe('https://acme.talkdeskid.eu/oauth/token')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ accountName: 'acme', region: 'eu' })
  })

  it('refuses to refresh against an unknown account instead of posting to `.talkdeskid.com`', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.refreshCredentials({ accessToken: 'old', refreshToken: 'rt', extra: { region: 'us' } }),
    ).rejects.toThrow('Talkdesk account name is required.')
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the region stored with the credentials', async () => {
    const create = offlineCreate()
    await adapter
      .listTickets({ accessToken: 'tok', extra: { accountName: 'acme', region: 'eu' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://api.talkdeskapp.eu',
    )
  })
})
