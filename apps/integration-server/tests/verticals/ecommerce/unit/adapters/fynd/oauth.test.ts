/**
 * Fynd is OAuth2 authorization-code, not client-credentials — verified
 * against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`, `sdk/platform/OAuthClient.js`
 * (`startAuthorization`, `getAccesstokenObj`) and
 * `dist/cjs/index.js` of `@gofynd/fp-signature@1.0.1` (default signing
 * secret `'1234567'`, since `startAuthorization` never passes one).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { createHash, createHmac } from 'node:crypto'
import {
  buildAuthorizeUrl,
  exchangeCode,
  refreshToken,
} from '../../../../../../src/verticals/ecommerce/adapters/fynd/auth'
import { FyndAdapter } from '../../../../../../src/verticals/ecommerce/adapters/fynd/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://app.example.com/auth/ecommerce/fynd/callback',
}

/** Reproduces the `@gofynd/fp-signature@1.0.1` v1.1 algorithm independently
 *  of `auth.ts`, so the test is not just re-running the same code. */
function expectedSignature(host: string, path: string, query: Record<string, string>, xFpDate: string): string {
  const full: Record<string, string> = { ...query, 'x-fp-date': xFpDate }
  const queryStr = Object.keys(full)
    .sort()
    .map((k) => `${k}=${full[k]}`)
    .join('&')
  const bodyHash = createHash('sha256').update('').digest('hex')
  const canonical = ['GET', path, queryStr, `host:${host}\n`, 'host', bodyHash].join('\n')
  const toSign = [xFpDate, createHash('sha256').update(canonical).digest('hex')].join('\n')
  return `v1.1:${createHmac('sha256', '1234567').update(toSign).digest('hex')}`
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildAuthorizeUrl', () => {
  it('builds a company-scoped authorize URL with the standard OAuth params', () => {
    const url = new URL(buildAuthorizeUrl('10000123', 'cid', CFG.redirectUri, ['company/products/read'], 'st'))
    expect(url.origin).toBe('https://api.fynd.com')
    expect(url.pathname).toBe('/service/panel/authentication/v1.0/company/10000123/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CFG.redirectUri)
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('company/products/read')
  })

  it('signs the query the same way the official SDK does, byte for byte', () => {
    const url = new URL(buildAuthorizeUrl('10000123', 'cid', CFG.redirectUri, ['company/products/read'], 'st'))
    const xFpDate = url.searchParams.get('x-fp-date')
    expect(xFpDate).toMatch(/^\d{8}T\d{6}Z$/)
    const query = {
      client_id: 'cid',
      scope: 'company/products/read',
      redirect_uri: CFG.redirectUri,
      state: 'st',
      response_type: 'code',
    }
    const want = expectedSignature('api.fynd.com', url.pathname, query, xFpDate as string)
    expect(url.searchParams.get('x-fp-signature')).toBe(want)
  })
})

describe('exchangeCode', () => {
  it('POSTs Basic-auth form-encoded authorization_code to the company token endpoint', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', refresh_token: 'rtok', expires_in: 3600 },
    })
    const creds = await exchangeCode('10000123', 'authcode', 'cid', 'sec')
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(url).toBe('https://api.fynd.com/service/panel/authentication/v1.0/company/10000123/oauth/token')
    expect(body).toBe('grant_type=authorization_code&code=authcode')
    expect(config.headers.Authorization).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`)
    expect(config.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(creds.accessToken).toBe('tok')
    expect(creds.refreshToken).toBe('rtok')
    expect(creds.expiresAt).toBeInstanceOf(Date)
  })
})

describe('refreshToken', () => {
  it('POSTs Basic-auth form-encoded refresh_token to the company token endpoint', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok2', expires_in: 3600 } })
    await refreshToken('10000123', 'rtok', 'cid', 'sec')
    const [url, body] = post.mock.calls[0] as [string, string]
    expect(url).toBe('https://api.fynd.com/service/panel/authentication/v1.0/company/10000123/oauth/token')
    expect(body).toBe('grant_type=refresh_token&refresh_token=rtok')
  })
})

describe('FyndAdapter OAuth wiring', () => {
  const adapter = new FyndAdapter(CFG)

  it('declares companyId and applicationId as required oauthFields', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'companyId', required: true }),
      expect.objectContaining({ name: 'applicationId', required: true }),
    ])
  })

  it('fails with a readable message, not a TypeError, when no companyId is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(/companyId/)
  })

  it('exchanges on the customer’s company and stores companyId + applicationId in extra', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      companyId: '10000123',
      applicationId: 'app1',
    })
    expect(creds.extra).toEqual({ companyId: '10000123', applicationId: 'app1' })
  })

  it('refreshCredentials requires extra.companyId and a refreshToken', async () => {
    await expect(
      adapter.refreshCredentials({ accessToken: 'tok', extra: {} }),
    ).rejects.toThrow(/companyId/)
  })
})
