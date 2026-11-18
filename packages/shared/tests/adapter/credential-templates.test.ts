import { describe, it, expect, vi } from 'vitest'
import {
  simpleApiKey,
  oauth2ClientCredentials,
  customForm,
} from '../../src/adapter/credential-templates'

describe('simpleApiKey', () => {
  it('returns a single password field with sensible defaults', () => {
    const helper = simpleApiKey()
    const fields = helper.credentialFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]).toEqual({
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: undefined,
      helpText: undefined,
      required: true,
    })
  })

  it('honours custom field name + label + helpText', () => {
    const helper = simpleApiKey({
      fieldName: 'token',
      label: 'Personal access token',
      helpText: 'Profile → Developer settings → New token',
    })
    const [f] = helper.credentialFields()
    expect(f.name).toBe('token')
    expect(f.label).toBe('Personal access token')
    expect(f.helpText).toBe('Profile → Developer settings → New token')
  })

  it('round-trips the submitted value into accessToken', async () => {
    const helper = simpleApiKey()
    const creds = await helper.exchangeCredentials({ apiKey: 'sk_live_abc123' })
    expect(creds).toEqual({ accessToken: 'sk_live_abc123' })
  })

  it('uses the custom field name on exchange', async () => {
    const helper = simpleApiKey({ fieldName: 'token' })
    const creds = await helper.exchangeCredentials({ token: 'pat_xyz' })
    expect(creds.accessToken).toBe('pat_xyz')
  })

  it('rejects empty input when the field is required', async () => {
    const helper = simpleApiKey()
    await expect(helper.exchangeCredentials({ apiKey: '   ' })).rejects.toThrow(/required/i)
    await expect(helper.exchangeCredentials({})).rejects.toThrow(/required/i)
  })

  it('allows empty input when required is false', async () => {
    const helper = simpleApiKey({ required: false })
    const creds = await helper.exchangeCredentials({ apiKey: '' })
    expect(creds.accessToken).toBe('')
  })
})

describe('oauth2ClientCredentials', () => {
  function fakeFetch(json: Record<string, unknown>, status = 200): typeof fetch {
    return vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      async text() { return JSON.stringify(json) },
      async json() { return json },
    } as unknown as Response)) as unknown as typeof fetch
  }

  it('builds clientId + clientSecret + extra fields', () => {
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://example.com/token',
      additionalFields: [
        { name: 'region', label: 'Region', type: 'text', required: true },
      ],
      fetchImpl: fakeFetch({ access_token: 't' }),
    })
    const fields = helper.credentialFields()
    expect(fields.map((f) => f.name)).toEqual(['clientId', 'clientSecret', 'region'])
    expect(fields[0].type).toBe('text')
    expect(fields[1].type).toBe('password')
  })

  it('POSTs grant_type=client_credentials with scopes joined by space', async () => {
    const fetchImpl = fakeFetch({ access_token: 'tok', expires_in: 3600, scope: 'read write' })
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://api.example.com/oauth/token',
      scopes: ['read', 'write'],
      fetchImpl,
    })
    await helper.exchangeCredentials({ clientId: 'CID', clientSecret: 'CSEC' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://api.example.com/oauth/token')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe('CID')
    expect(body.get('client_secret')).toBe('CSEC')
    expect(body.get('scope')).toBe('read write')
  })

  it('parses access_token, refresh_token, expires_in into Credentials', async () => {
    const fetchImpl = fakeFetch({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 60,
      scope: 'a b',
    })
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://example.com/t',
      fetchImpl,
    })
    const before = Date.now()
    const creds = await helper.exchangeCredentials({ clientId: 'c', clientSecret: 's' })
    expect(creds.accessToken).toBe('access')
    expect(creds.refreshToken).toBe('refresh')
    expect(creds.scope).toBe('a b')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 59_000)
    expect(creds.expiresAt!.getTime()).toBeLessThanOrEqual(before + 61_000)
  })

  it('preserves additional fields plus clientId/clientSecret in extra', async () => {
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://example.com/t',
      additionalFields: [
        { name: 'projectKey', label: 'Project key', type: 'text', required: true },
      ],
      fetchImpl: fakeFetch({ access_token: 'tok' }),
    })
    const creds = await helper.exchangeCredentials({
      clientId: 'CID',
      clientSecret: 'CSEC',
      projectKey: 'my-project',
    })
    expect(creds.extra).toEqual({
      clientId: 'CID',
      clientSecret: 'CSEC',
      projectKey: 'my-project',
    })
  })

  it('lets buildExtra override the default shape', async () => {
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://example.com/t',
      buildExtra: (fields) => ({ region: fields['region']?.toUpperCase() ?? 'US' }),
      additionalFields: [{ name: 'region', label: 'Region', type: 'text' }],
      fetchImpl: fakeFetch({ access_token: 'tok' }),
    })
    const creds = await helper.exchangeCredentials({
      clientId: 'c', clientSecret: 's', region: 'eu',
    })
    expect(creds.extra).toEqual({ region: 'EU' })
  })

  it('rejects empty client credentials', async () => {
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://example.com/t',
      fetchImpl: fakeFetch({ access_token: 'tok' }),
    })
    await expect(
      helper.exchangeCredentials({ clientId: '', clientSecret: 'x' }),
    ).rejects.toThrow(/required/i)
    await expect(
      helper.exchangeCredentials({ clientId: 'x', clientSecret: '' }),
    ).rejects.toThrow(/required/i)
  })

  it('rejects missing required additional fields', async () => {
    const helper = oauth2ClientCredentials({
      tokenUrl: 'https://example.com/t',
      additionalFields: [{ name: 'region', label: 'Region', type: 'text', required: true }],
      fetchImpl: fakeFetch({ access_token: 'tok' }),
    })
    await expect(
      helper.exchangeCredentials({ clientId: 'c', clientSecret: 's' }),
    ).rejects.toThrow(/Region.*required/i)
  })

  it('surfaces token-endpoint failures with status + body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      async text() { return 'invalid_client' },
      async json() { return {} },
    } as unknown as Response)) as unknown as typeof fetch
    const helper = oauth2ClientCredentials({ tokenUrl: 'https://example.com/t', fetchImpl })
    await expect(
      helper.exchangeCredentials({ clientId: 'c', clientSecret: 's' }),
    ).rejects.toThrow(/401.*invalid_client/)
  })
})

describe('customForm', () => {
  it('passes fields through unchanged', () => {
    const helper = customForm({
      fields: [
        { name: 'host', label: 'Host', type: 'url', required: true },
        { name: 'token', label: 'Token', type: 'password', required: true },
      ],
      exchange: async () => ({ accessToken: '' }),
    })
    const fields = helper.credentialFields()
    expect(fields.map((f) => f.name)).toEqual(['host', 'token'])
  })

  it('delegates exchange to the supplied function', async () => {
    const exchange = vi.fn(async (fields: Record<string, string>) => ({
      accessToken: fields['token'] ?? '',
      extra: { host: fields['host'] },
    }))
    const helper = customForm({
      fields: [
        { name: 'host', label: 'Host', type: 'url' },
        { name: 'token', label: 'Token', type: 'password' },
      ],
      exchange,
    })
    const creds = await helper.exchangeCredentials({ host: 'https://x', token: 'abc' })
    expect(exchange).toHaveBeenCalledOnce()
    expect(creds.accessToken).toBe('abc')
    expect(creds.extra).toEqual({ host: 'https://x' })
  })
})
