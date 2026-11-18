import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { OneCEnterpriseClient } from '../../../../../../src/verticals/accounting/adapters/1centerprise/client'
import { ONECENT_CREDENTIAL_FORM } from '../../../../../../src/verticals/accounting/adapters/1centerprise/auth'
import * as constants from '../../../../../../src/verticals/accounting/adapters/1centerprise/constants'
import * as auth from '../../../../../../src/verticals/accounting/adapters/1centerprise/auth'
import type { Credentials } from '@opensteward/shared'

/**
 * Two problems, one adapter.
 *
 * 1. A full OAuth2 authorization-code flow was wired to `demo.1c.ru/oauth/*`.
 *    Those endpoints do not exist — re-probed 2026-09-15, both
 *    `/oauth/token` and `/odata/standard.odata/` answer 404 with an HTML SPA
 *    page. No customer could ever complete that flow; the credential form is
 *    the only path Connect Link offers.
 *
 * 2. The client sent the stored secret as `Authorization: Bearer` and nothing
 *    else. 1C publishes OData with web-service authentication, which is HTTP
 *    Basic against an infobase user; a JWT bearer works only when the
 *    publication's `default.vrd` enables `accessTokenAuthentication`.
 *
 * Both are real, so the transport is chosen rather than replaced: Basic when
 * the connection carries a username, Bearer when it carries a token. Removing
 * Bearer outright would have broken the `accessTokenAuthentication` setup the
 * form's own help text describes, which is a documented 1C feature, not a
 * mistake.
 */

function headersOf(client: OneCEnterpriseClient): Record<string, string> {
  return (client as unknown as { http: { defaults: { headers: Record<string, string> } } }).http
    .defaults.headers
}

const BASE = { extra: { baseUrl: 'https://1c.example.com/acc/odata/standard.odata' } }

// The form resolves the host before storing it (SSRF guard), so the public
// answer is stubbed exactly as the sibling per-customer-host suite does.
beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})
afterEach(() => {
  setDnsResolver(undefined)
})

describe('1centerprise auth transport', () => {
  it('sends HTTP Basic when the connection carries an infobase username', () => {
    const creds = {
      accessToken: '',
      extra: { ...BASE.extra, username: 'integration', password: 's3cret' },
    } as Credentials
    const h = headersOf(new OneCEnterpriseClient(creds))
    expect(h.Authorization).toBe(`Basic ${Buffer.from('integration:s3cret').toString('base64')}`)
  })

  it('still sends Bearer for an accessTokenAuthentication publication', () => {
    const creds = { accessToken: 'jwt-token', extra: BASE.extra } as Credentials
    expect(headersOf(new OneCEnterpriseClient(creds)).Authorization).toBe('Bearer jwt-token')
  })

  it('prefers Basic when both are somehow present', () => {
    // A username is only ever stored by the Basic branch of the form, so its
    // presence is the deliberate signal.
    const creds = {
      accessToken: 'jwt-token',
      extra: { ...BASE.extra, username: 'u', password: 'p' },
    } as Credentials
    expect(headersOf(new OneCEnterpriseClient(creds)).Authorization).toBe(
      `Basic ${Buffer.from('u:p').toString('base64')}`,
    )
  })
})

describe('1centerprise dead OAuth2 flow', () => {
  it('exports no OAuth2 endpoint constants', () => {
    // demo.1c.ru/oauth/{authorize,token} both 404 — a vendor demo host, not an
    // identity provider.
    expect(constants).not.toHaveProperty('ONECENT_AUTH_URL')
    expect(constants).not.toHaveProperty('ONECENT_TOKEN_URL')
  })

  it('exports no authorization-code helpers', () => {
    expect(auth).not.toHaveProperty('buildAuthUrl')
    expect(auth).not.toHaveProperty('exchangeCode')
    expect(auth).not.toHaveProperty('refreshAccessToken')
  })
})

describe('1centerprise credential form', () => {
  it('collects the infobase username and password alongside the token option', () => {
    const names = ONECENT_CREDENTIAL_FORM.credentialFields().map((f) => f.name)
    expect(names).toContain('odataUrl')
    expect(names).toContain('username')
    expect(names).toContain('password')
  })

  it('stores a username/password pair for the Basic path', async () => {
    const creds = await ONECENT_CREDENTIAL_FORM.exchangeCredentials({
      odataUrl: 'https://1c.example.com/acc/odata/standard.odata',
      username: 'integration',
      password: 's3cret',
    })
    expect(creds.extra?.username).toBe('integration')
    expect(creds.extra?.password).toBe('s3cret')
  })

  it('rejects a submission with neither a password nor a token', async () => {
    await expect(
      ONECENT_CREDENTIAL_FORM.exchangeCredentials({
        odataUrl: 'https://1c.example.com/acc/odata/standard.odata',
        username: 'integration',
      }),
    ).rejects.toThrow()
  })
})
