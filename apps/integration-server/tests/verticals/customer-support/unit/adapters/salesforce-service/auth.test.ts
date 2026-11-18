/**
 * Salesforce OAuth 2.0 web server flow, against the documented requests:
 *
 * - Authorize: `https://hostname/services/oauth2/authorize` with
 *   response_type=code, client_id, redirect_uri (+ scope, state).
 * - Token: `POST https://hostname/services/oauth2/token`, form-encoded
 *   grant_type=authorization_code, code, client_id, client_secret,
 *   redirect_uri; response carries access_token, refresh_token (with the
 *   refresh_token scope), instance_url, id, scope — and no expires_in.
 * - Refresh: grant_type=refresh_token, refresh_token, client_id,
 *   client_secret; a new refresh_token only with rotation enabled.
 * - Hosts: login.salesforce.com; "For sandboxes, use test.salesforce.com".
 *
 * https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_web_server_flow.htm&type=5
 * https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_refresh_token_flow.htm&type=5
 * https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_endpoints.htm&type=5
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { SalesforceServiceAdapter } from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/index'
import { ADAPTER_FACTORIES } from '../../../../../../src/verticals/customer-support/adapter/factories'

const CFG = {
  clientId: 'sf-consumer-key',
  clientSecret: 'sf-consumer-secret',
  redirectUri: 'https://opensteward.example/auth/customer-support/salesforce-service/callback',
}

interface TokenCall {
  url: string
  method: string | undefined
  headers: Record<string, string>
  form: Record<string, string>
}

function fakeToken(response: Record<string, unknown>, status = 200) {
  const calls: TokenCall[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      form: Object.fromEntries(new URLSearchParams(String(init?.body ?? ''))),
    })
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return calls
}

/**
 * The documented web server flow response fields. Values are test data
 * (shortened from the doc example); refresh_token is present as it is when
 * the app has the refresh_token scope.
 */
const TOKEN_RESPONSE = {
  access_token: '00DB0000000TfcR!AQQAQFhoK8vTMg_rKA',
  refresh_token: '5Aep861KIwKdekr90I4iHdtDgWwRoG',
  signature: 'd/SxeYBxH0GSVko0HMgcUxuZy0PA2cDDz1u7g7JtDHw=',
  scope: 'api refresh_token',
  instance_url: 'https://mycompany.my.salesforce.com',
  id: 'https://login.salesforce.com/id/00DB0000000TfcRMAS/005B0000005Bk90IAC',
  token_type: 'Bearer',
  issued_at: '1558553873237',
}

afterEach(() => vi.restoreAllMocks())

describe('salesforce-service getAuthUrl', () => {
  const adapter = new SalesforceServiceAdapter(CFG)

  it('is registered, and asks for the org type before the redirect', () => {
    expect(ADAPTER_FACTORIES['salesforce-service']).toBeDefined()
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({
        name: 'environment',
        type: 'select',
        required: true,
        options: [
          expect.objectContaining({ value: 'production' }),
          expect.objectContaining({ value: 'sandbox' }),
        ],
      }),
    ])
  })

  it('production: login.salesforce.com with the documented parameters and default scopes', () => {
    const u = new URL(
      adapter.getAuthUrl('st-1', undefined, undefined, { environment: 'production' }),
    )
    expect(`${u.origin}${u.pathname}`).toBe(
      'https://login.salesforce.com/services/oauth2/authorize',
    )
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'sf-consumer-key',
      redirect_uri: CFG.redirectUri,
      scope: 'api refresh_token',
      state: 'st-1',
    })
  })

  it('sandbox: test.salesforce.com', () => {
    const u = new URL(adapter.getAuthUrl('st-2', undefined, undefined, { environment: 'sandbox' }))
    expect(`${u.origin}${u.pathname}`).toBe('https://test.salesforce.com/services/oauth2/authorize')
  })

  it('no inputs at all: production', () => {
    const u = new URL(adapter.getAuthUrl('st-3'))
    expect(u.origin).toBe('https://login.salesforce.com')
  })

  it('honours overrideScopes', () => {
    const u = new URL(adapter.getAuthUrl('st-4', ['api', 'offline_access']))
    expect(u.searchParams.get('scope')).toBe('api offline_access')
  })

  it('uses the deployment-configured scopes when there is no override', () => {
    const configured = new SalesforceServiceAdapter({ ...CFG, scopes: ['api', 'id'] })
    expect(new URL(configured.getAuthUrl('st-5')).searchParams.get('scope')).toBe('api id')
  })

  it('refuses an org type that has no documented host', () => {
    expect(() => adapter.getAuthUrl('st-6', undefined, undefined, { environment: 'eu' })).toThrow(
      /production.*sandbox/,
    )
  })
})

describe('salesforce-service code exchange', () => {
  const adapter = new SalesforceServiceAdapter(CFG)

  it('POSTs the documented form to the production token endpoint, secret in the body', async () => {
    const calls = fakeToken(TOKEN_RESPONSE)
    const creds = await adapter.exchangeCodeWithInputs('code-123', CFG.redirectUri, {
      environment: 'production',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://login.salesforce.com/services/oauth2/token')
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(calls[0]!.headers).not.toHaveProperty('Authorization')
    expect(calls[0]!.form).toEqual({
      grant_type: 'authorization_code',
      code: 'code-123',
      client_id: 'sf-consumer-key',
      client_secret: 'sf-consumer-secret',
      redirect_uri: CFG.redirectUri,
    })
    expect(creds).toEqual({
      accessToken: TOKEN_RESPONSE.access_token,
      refreshToken: TOKEN_RESPONSE.refresh_token,
      scope: 'api refresh_token',
      extra: {
        instanceUrl: 'https://mycompany.my.salesforce.com',
        environment: 'production',
        identityUrl: TOKEN_RESPONSE.id,
      },
    })
    // No expires_in is documented, so no expiry is invented.
    expect(creds.expiresAt).toBeUndefined()
  })

  it('sandbox codes are exchanged on test.salesforce.com', async () => {
    const calls = fakeToken(TOKEN_RESPONSE)
    const creds = await adapter.exchangeCodeWithInputs('code-9', CFG.redirectUri, {
      environment: 'sandbox',
    })
    expect(calls[0]!.url).toBe('https://test.salesforce.com/services/oauth2/token')
    expect(creds.extra?.['environment']).toBe('sandbox')
  })

  it('never sends a code_verifier: no code_challenge was sent at authorize', async () => {
    const calls = fakeToken(TOKEN_RESPONSE)
    await adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { environment: 'production' })
    expect(calls[0]!.form).not.toHaveProperty('code_verifier')
    expect(new URL(adapter.getAuthUrl('s')).searchParams.has('code_challenge')).toBe(false)
  })

  it('plain exchangeCode (no inputs collected) exchanges on production', async () => {
    const calls = fakeToken(TOKEN_RESPONSE)
    await adapter.exchangeCode('code-1', CFG.redirectUri)
    expect(calls[0]!.url).toBe('https://login.salesforce.com/services/oauth2/token')
    expect(calls[0]!.form['redirect_uri']).toBe(CFG.redirectUri)
  })

  it('fails when the token response has no instance_url (every API call needs it)', async () => {
    fakeToken({ ...TOKEN_RESPONSE, instance_url: undefined })
    await expect(adapter.exchangeCode('c', CFG.redirectUri)).rejects.toThrow(/instance_url/)
  })

  it('refuses a non-https instance_url', async () => {
    fakeToken({ ...TOKEN_RESPONSE, instance_url: 'http://evil.example' })
    await expect(adapter.exchangeCode('c', CFG.redirectUri)).rejects.toThrow(/non-https/)
  })

  it('surfaces a token-endpoint error with its status', async () => {
    fakeToken({ error: 'invalid_grant', error_description: 'expired authorization code' }, 400)
    await expect(adapter.exchangeCode('c', CFG.redirectUri)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('invalid_grant'),
    })
  })
})

describe('salesforce-service refresh', () => {
  const adapter = new SalesforceServiceAdapter(CFG)
  const stored: Credentials = {
    accessToken: 'old-access',
    refreshToken: 'refresh-1',
    scope: 'api refresh_token',
    extra: { instanceUrl: 'https://mycompany.my.salesforce.com', environment: 'sandbox' },
  }

  it('POSTs grant_type=refresh_token to the host the grant came from', async () => {
    const calls = fakeToken({
      access_token: 'new-access',
      instance_url: 'https://mycompany.my.salesforce.com/',
      id: TOKEN_RESPONSE.id,
      token_type: 'Bearer',
      issued_at: '1278448384422',
      scope: 'id api refresh_token',
    })
    const fresh = await adapter.refreshCredentials(stored)
    expect(calls[0]!.url).toBe('https://test.salesforce.com/services/oauth2/token')
    expect(calls[0]!.form).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
      client_id: 'sf-consumer-key',
      client_secret: 'sf-consumer-secret',
    })
    expect(calls[0]!.headers).not.toHaveProperty('Authorization')
    // No rotation: the refresh token is kept; instance_url survives (normalised).
    expect(fresh.accessToken).toBe('new-access')
    expect(fresh.refreshToken).toBe('refresh-1')
    expect(fresh.extra).toEqual({
      instanceUrl: 'https://mycompany.my.salesforce.com',
      environment: 'sandbox',
    })
  })

  it('takes a rotated refresh token and keeps instanceUrl when the response omits it', async () => {
    fakeToken({ access_token: 'new-access', refresh_token: 'refresh-2' })
    const fresh = await adapter.refreshCredentials(stored)
    expect(fresh.refreshToken).toBe('refresh-2')
    expect(fresh.extra?.['instanceUrl']).toBe('https://mycompany.my.salesforce.com')
  })

  it('a connection stored before environment existed refreshes on production', async () => {
    const calls = fakeToken({ access_token: 'a', instance_url: 'https://x.my.salesforce.com' })
    await adapter.refreshCredentials({
      accessToken: 'o',
      refreshToken: 'r',
      extra: { instanceUrl: 'https://x.my.salesforce.com' },
    })
    expect(calls[0]!.url).toBe('https://login.salesforce.com/services/oauth2/token')
  })

  it('refuses to refresh without a refresh token, before any request', async () => {
    const calls = fakeToken({})
    await expect(
      adapter.refreshCredentials({ accessToken: 'o', extra: { instanceUrl: 'https://x' } }),
    ).rejects.toThrow(/refresh token/)
    expect(calls).toHaveLength(0)
  })
})
