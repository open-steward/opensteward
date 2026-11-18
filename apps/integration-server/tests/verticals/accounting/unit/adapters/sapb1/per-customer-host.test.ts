/**
 * SAP Business One's Service Layer is installed on the customer's own server
 * and authenticates with a session login (company DB + user + password), so
 * every value is per customer. The Connect Link form must collect all of them,
 * vet the host (https, public) BEFORE sending the password to it, log in, and
 * store the session plus what the client and refresh read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { SapB1Adapter } from '../../../../../../src/verticals/accounting/adapters/sapb1'

const PUBLIC_IP = '93.184.216.34'
const PRIVATE_IP = '192.168.10.4'

let savedAllow: string | undefined
beforeEach(() => {
  savedAllow = process.env['OST_ALLOW_PRIVATE_HOSTS']
  delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  setDnsResolver(async (host) => ({
    address: host.endsWith('.internal.example') ? PRIVATE_IP : PUBLIC_IP,
  }))
})
afterEach(() => {
  setDnsResolver(undefined)
  if (savedAllow === undefined) delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  else process.env['OST_ALLOW_PRIVATE_HOSTS'] = savedAllow
  vi.restoreAllMocks()
})

const VALID = {
  serviceLayerUrl: 'https://b1.example.com:50000',
  companyDb: 'SBODEMOUS',
  username: 'manager',
  password: 'p:ss',
}

function loginOk(sessionId = 'sess-1') {
  return vi.spyOn(axios, 'post').mockResolvedValue({
    headers: { 'set-cookie': [`B1SESSION=${sessionId}; HttpOnly; Secure`, 'ROUTEID=.node0'] },
    data: { SessionId: sessionId },
  })
}

describe('SAP Business One Connect Link form', () => {
  const adapter = new SapB1Adapter({ host: '' })

  it('declares the Service Layer URL, company DB, user and password the login needs', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['companyDb', 'password', 'serviceLayerUrl', 'username'])
    expect(byName['serviceLayerUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['serviceLayerUrl']?.helpText).toMatch(/OST_ALLOW_PRIVATE_HOSTS/)
    expect(byName['companyDb']).toMatchObject({ type: 'text', required: true })
    expect(byName['username']).toMatchObject({ type: 'text', required: true })
    expect(byName['password']).toMatchObject({ type: 'password', required: true })
  })

  it.each([
    ['serviceLayerUrl', /Service Layer URL is required/],
    ['companyDb', /Company database is required/],
    ['username', /User name is required/],
    ['password', /Password is required/],
  ])('rejects a blank %s', async (field, message) => {
    const post = loginOk()
    await expect(adapter.exchangeCredentials({ ...VALID, [field]: ' ' })).rejects.toThrow(message)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a Service Layer URL that is not https', async () => {
    const post = loginOk()
    await expect(
      adapter.exchangeCredentials({ ...VALID, serviceLayerUrl: 'http://b1.example.com:50000' }),
    ).rejects.toThrow(/must use https/)
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a LAN-hosted Service Layer before sending the password to it', async () => {
    const post = loginOk()
    await expect(
      adapter.exchangeCredentials({ ...VALID, serviceLayerUrl: 'https://b1.internal.example:50000' }),
    ).rejects.toThrow(/private or reserved network address/)
    await expect(
      adapter.exchangeCredentials({ ...VALID, serviceLayerUrl: 'https://10.1.2.3:50000' }),
    ).rejects.toThrow(/private or reserved network address/)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a URL with a path other than the Service Layer suffix', async () => {
    const post = loginOk()
    await expect(
      adapter.exchangeCredentials({ ...VALID, serviceLayerUrl: 'https://b1.example.com/proxy/sl' }),
    ).rejects.toThrow(/must be just the server address/)
    expect(post).not.toHaveBeenCalled()
  })

  it('logs in to the normalised host and stores the session plus what the client reads', async () => {
    const post = loginOk('sess-1')
    const creds = await adapter.exchangeCredentials({
      ...VALID,
      serviceLayerUrl: ' https://B1.example.com:50000/b1s/v1/ ',
      companyDb: ' SBODEMOUS ',
    })
    expect(post).toHaveBeenCalledWith(
      'https://b1.example.com:50000/b1s/v1/Login',
      { UserName: 'manager', Password: 'p:ss', CompanyDB: 'SBODEMOUS' },
      expect.anything(),
    )
    expect(creds.accessToken).toBe('sess-1')
    expect(creds.extra).toMatchObject({ host: 'b1.example.com:50000', companyDb: 'SBODEMOUS' })
  })

  it('reports a login that returns no session', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ headers: {}, data: {} })
    await expect(adapter.exchangeCredentials(VALID)).rejects.toThrow(/did not return a session/)
  })

  it('re-logs in on refresh with the stored password intact (colons included)', async () => {
    loginOk('sess-1')
    const creds = await adapter.exchangeCredentials(VALID)
    vi.restoreAllMocks()
    const post = loginOk('sess-2')
    const refreshed = await adapter.refreshCredentials(creds)
    expect(post).toHaveBeenCalledWith(
      'https://b1.example.com:50000/b1s/v1/Login',
      { UserName: 'manager', Password: 'p:ss', CompanyDB: 'SBODEMOUS' },
      expect.anything(),
    )
    expect(refreshed.accessToken).toBe('sess-2')
  })
})

describe('SAP Business One client host comes from the connection', () => {
  it('calls the Service Layer stored on the credentials with the session cookie', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new SapB1Adapter({ host: '' })
    await adapter
      .getOrganization({ accessToken: 'sess-1', extra: { host: 'b1.example.com:50000' } })
      .catch(() => undefined)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://b1.example.com:50000/b1s/v1/',
        headers: expect.objectContaining({ Cookie: 'B1SESSION=sess-1' }),
      }),
    )
  })

  it('refuses to build a request when the connection has no host', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new SapB1Adapter({ host: '' })
    await expect(adapter.getOrganization({ accessToken: 'sess-1' })).rejects.toThrow(
      /missing its Service Layer host/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
