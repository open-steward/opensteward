/**
 * Every Fatture in Cloud resource lives under `/c/{company_id}/…`. The
 * adapter took `companyId` from deployment config (which the admin UI cannot
 * set, and which it then never used) and built paths from
 * `credentials.tenantId`, which nothing populated — so every request went to
 * `/c//…`.
 *
 * The company is not needed before the redirect: after the token exchange the
 * adapter lists the user's companies (`GET /user/companies`). A user with one
 * company needs to type nothing. A user who can access several may name one
 * in an optional `oauthField`; without it the connect fails with a message
 * listing them instead of silently picking one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { FattureCloudAdapter } from '../../../../../../src/verticals/accounting/adapters/fatturecloud/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/accounting/fatturecloud/callback',
  scopes: ['entity.clients:r'],
}

const TOKEN = { data: { access_token: 'tok', refresh_token: 'rt', expires_in: 86400 } }
const companies = (...list: Array<{ id: number; name: string }>) => ({
  data: { data: { companies: list.map((c) => ({ ...c, type: 'company' })) } },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FattureCloudAdapter company discovery', () => {
  const adapter = new FattureCloudAdapter(CFG)

  it('asks for a company only optionally, before the redirect', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'companyId', type: 'text', required: false }),
    ])
  })

  it('records the only company the user can access', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(TOKEN)
    const get = vi.spyOn(axios, 'get').mockResolvedValue(companies({ id: 12345, name: 'Acme Srl' }))
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {})
    expect(post.mock.calls[0][0]).toBe('https://api-v2.fattureincloud.it/oauth/token')
    expect(get.mock.calls[0][0]).toBe('https://api-v2.fattureincloud.it/user/companies')
    expect(get.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer tok' } })
    expect(creds.tenantId).toBe('12345')
    expect(creds.extra).toEqual({ companyId: '12345' })
  })

  it('also discovers the company on the plain exchange path', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(TOKEN)
    vi.spyOn(axios, 'get').mockResolvedValue(companies({ id: 7, name: 'Solo' }))
    const creds = await adapter.exchangeCode('code', CFG.redirectUri)
    expect(creds.tenantId).toBe('7')
  })

  it('picks the requested company by id or by name when the user has several', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(TOKEN)
    vi.spyOn(axios, 'get').mockResolvedValue(
      companies({ id: 1, name: 'Alpha Srl' }, { id: 2, name: 'Beta Spa' }),
    )
    const byId = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { companyId: ' 2 ' })
    expect(byId.tenantId).toBe('2')
    const byName = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { companyId: 'alpha srl' })
    expect(byName.tenantId).toBe('1')
    expect(byName.extra).toEqual({ companyId: '1' })
  })

  it('refuses to guess between several companies and names them', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(TOKEN)
    vi.spyOn(axios, 'get').mockResolvedValue(
      companies({ id: 1, name: 'Alpha Srl' }, { id: 2, name: 'Beta Spa' }),
    )
    await expect(adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {})).rejects.toThrow(
      'This Fatture in Cloud user can access several companies (Alpha Srl [1], Beta Spa [2])',
    )
  })

  it('rejects a requested company the user cannot access', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(TOKEN)
    vi.spyOn(axios, 'get').mockResolvedValue(companies({ id: 1, name: 'Alpha Srl' }))
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { companyId: '999' }),
    ).rejects.toThrow('Fatture in Cloud company "999" is not one this user can access')
  })

  it('rejects a user with no companies', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(TOKEN)
    vi.spyOn(axios, 'get').mockResolvedValue(companies())
    await expect(adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {})).rejects.toThrow(
      'This Fatture in Cloud user has no companies',
    )
  })

  it('refresh keeps the company', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok2', expires_in: 86400 } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      tenantId: '12345',
      extra: { companyId: '12345' },
    })
    expect(creds.tenantId).toBe('12345')
    expect(creds.extra).toEqual({ companyId: '12345' })
    expect(creds.refreshToken).toBe('rt')
  })

  it('calls the API under the stored company', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .getOrganization({ accessToken: 'tok', extra: { companyId: '12345' } })
      .catch(() => undefined) // the request itself is not under test
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://api-v2.fattureincloud.it/c/12345/')
  })

  it('refuses to call the API without a company instead of requesting /c//', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(adapter.getOrganization({ accessToken: 'tok' })).rejects.toThrow(
      'Fatture in Cloud company is missing from the connection',
    )
    expect(create).not.toHaveBeenCalled()
  })
})
