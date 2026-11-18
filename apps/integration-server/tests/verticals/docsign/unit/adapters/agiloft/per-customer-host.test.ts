/**
 * Agiloft's OAuth endpoints and REST interface live on the customer's own
 * Agiloft server, and every REST path names the customer's knowledge base.
 * Both used to come only from deployment config — which the admin UI cannot
 * write — so every Connect Link authorised against `app.agiloft.com` with an
 * empty KB. They are now `oauthFields` the customer supplies before the
 * redirect, validated, and carried on `credentials.extra`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { AgiloftAdapter } from '../../../../../../src/verticals/docsign/adapters/agiloft/index'
import {
  normaliseAgiloftHost,
  normaliseAgiloftKb,
} from '../../../../../../src/verticals/docsign/adapters/agiloft/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/docsign/agiloft/callback',
}

const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 900 }

function fakeHttp() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: { success: true, message: '', result: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

beforeEach(() => {
  delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.restoreAllMocks()
})

describe('normaliseAgiloftHost', () => {
  it.each([
    ['acme.agiloft.com', 'acme.agiloft.com'],
    ['https://acme.agiloft.com/', 'acme.agiloft.com'],
    ['https://ACME.Agiloft.com/ui2/login?x=1', 'acme.agiloft.com'],
    ['  clm.example.org ', 'clm.example.org'],
    ['https://clm.example.org:8443', 'clm.example.org:8443'],
  ])('%s → %s', (input, want) => {
    expect(normaliseAgiloftHost(input)).toBe(want)
  })

  it('rejects blanks with a specific message', () => {
    expect(() => normaliseAgiloftHost('')).toThrow(
      'Agiloft server is required (e.g. acme.agiloft.com).',
    )
    expect(() => normaliseAgiloftHost('   ')).toThrow(
      'Agiloft server is required (e.g. acme.agiloft.com).',
    )
    expect(() => normaliseAgiloftHost(undefined)).toThrow(
      'Agiloft server is required (e.g. acme.agiloft.com).',
    )
  })

  it('rejects plain http — the token exchange carries the client secret', () => {
    expect(() => normaliseAgiloftHost('http://acme.agiloft.com')).toThrow(
      'Agiloft server must use https.',
    )
  })

  it('rejects values that are not a host', () => {
    expect(() => normaliseAgiloftHost('https://user:pw@acme.agiloft.com')).toThrow(
      'Agiloft server is not a valid https URL or host name.',
    )
    expect(() => normaliseAgiloftHost('not a host')).toThrow(
      'Agiloft server is not a valid https URL or host name.',
    )
  })
})

describe('normaliseAgiloftKb', () => {
  it('trims and keeps case (KB names are case-sensitive path segments)', () => {
    expect(normaliseAgiloftKb('  Demo ')).toBe('Demo')
  })

  it('rejects blanks and path-breaking characters', () => {
    expect(() => normaliseAgiloftKb('')).toThrow('Agiloft knowledge base (KB) name is required.')
    expect(() => normaliseAgiloftKb('Demo/../x')).toThrow(
      'Agiloft knowledge base (KB) name may only contain letters, digits, ".", "_" and "-".',
    )
  })
})

describe('AgiloftAdapter with a per-customer server and KB', () => {
  const adapter = new AgiloftAdapter(CFG)

  it('declares server and KB as required oauthFields', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'host', required: true }),
      expect.objectContaining({ name: 'kb', required: true }),
    ])
  })

  it('builds the authorize URL on the customer server', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, {
        host: 'https://acme.agiloft.com/',
        kb: 'Demo',
      }),
    )
    expect(u.host).toBe('acme.agiloft.com')
    expect(u.pathname).toBe('/ewws/oauth')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('client_id')).toBe('cid')
  })

  it('refuses to build an authorize URL when no server is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(
      'Agiloft server is required (e.g. acme.agiloft.com).',
    )
  })

  it('exchanges on the customer server and stores the normalised values in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      host: 'HTTPS://Acme.Agiloft.com/ui2',
      kb: 'Demo',
    })
    expect(post.mock.calls[0][0]).toBe('https://acme.agiloft.com/ewws/otoken')
    expect(creds.extra).toEqual({ host: 'acme.agiloft.com', kb: 'Demo' })
  })

  it('refuses a server that resolves to a private address before sending the secret', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.7' }])
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        host: 'clm.internal.example',
        kb: 'Demo',
      }),
    ).rejects.toThrow('SSRF block: clm.internal.example resolved to 10.0.0.7')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a blank KB before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        host: 'acme.agiloft.com',
        kb: ' ',
      }),
    ).rejects.toThrow('Agiloft knowledge base (KB) name is required.')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the server stored with the credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'ref',
      extra: { host: 'acme.agiloft.com', kb: 'Demo' },
    })
    expect(post.mock.calls[0][0]).toBe('https://acme.agiloft.com/ewws/otoken')
  })

  it('calls the REST interface on the server and KB stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter.listEnvelopes(
      { accessToken: 'tok', extra: { host: 'acme.agiloft.com', kb: 'Demo' } },
      {},
    )
    expect(baseURL()).toBe('https://acme.agiloft.com/ewws')
  })

  it('refuses to call a default host when the connection has no server', async () => {
    fakeHttp()
    await expect(adapter.listEnvelopes({ accessToken: 'tok' }, {})).rejects.toThrow(
      'Agiloft server is not configured for this connection.',
    )
  })
})
