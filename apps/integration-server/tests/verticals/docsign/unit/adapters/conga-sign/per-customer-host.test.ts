/**
 * Conga Sign has no authorization-code flow: tokens come from the OAuth2
 * client-credentials grant against a REGIONAL login host, and the API lives
 * on the matching regional RLS host. The region and the client credentials
 * belong to the customer's Conga tenant, but the adapter read them from
 * deployment config — which the admin UI cannot write a region into — and
 * exposed no credential form, so a Connect Link could never reach it.
 *
 * It now collects client id, secret and region through `credentialFields`,
 * mints on that region, and keeps all three on `credentials.extra`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { CongaSignAdapter } from '../../../../../../src/verticals/docsign/adapters/conga-sign/index'
import { normaliseCongaSignRegion } from '../../../../../../src/verticals/docsign/adapters/conga-sign/auth'

const TOKEN = { access_token: 'tok', token_type: 'Bearer', expires_in: 3600, scope: 'sign' }
const REGIONS_MSG =
  'Conga Sign region must be one of: prod-us, prod-eu, prod-au, preview-us, preview-eu, preview-au.'

function fakeHttp() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseCongaSignRegion', () => {
  it('accepts the documented regions, case- and whitespace-insensitively', () => {
    expect(normaliseCongaSignRegion(' PROD-EU ')).toBe('prod-eu')
    expect(normaliseCongaSignRegion('preview-au')).toBe('preview-au')
  })

  it('rejects blanks and unknown regions with specific messages', () => {
    expect(() => normaliseCongaSignRegion('')).toThrow('Conga Sign region is required.')
    expect(() => normaliseCongaSignRegion(undefined)).toThrow('Conga Sign region is required.')
    expect(() => normaliseCongaSignRegion('mars-1')).toThrow(REGIONS_MSG)
  })
})

describe('CongaSignAdapter credential form', () => {
  const adapter = new CongaSignAdapter({})

  it('collects client id, client secret and region through credentialFields', () => {
    const fields = adapter.credentialFields()
    expect(fields.map((f) => f.name)).toEqual(['clientId', 'clientSecret', 'region'])
    expect(fields.find((f) => f.name === 'clientSecret')?.type).toBe('password')
    const region = fields.find((f) => f.name === 'region')
    expect(region).toMatchObject({ type: 'select', required: true })
    expect(region?.options?.map((o) => o.value)).toEqual([
      'prod-us',
      'prod-eu',
      'prod-au',
      'preview-us',
      'preview-eu',
      'preview-au',
    ])
  })

  it('mints on the chosen region and stores what refresh needs in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCredentials({
      clientId: ' id ',
      clientSecret: 'sec',
      region: 'PROD-EU',
    })
    expect(post.mock.calls[0][0]).toBe('https://login.congacloud.eu/api/v1/auth/connect/token')
    const body = new URLSearchParams(String(post.mock.calls[0][1]))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe('id')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ region: 'prod-eu', clientId: 'id', clientSecret: 'sec' })
  })

  it('rejects a missing region or client credential before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCredentials({ clientId: 'id', clientSecret: 'sec', region: '' }),
    ).rejects.toThrow('Conga Sign region is required.')
    await expect(
      adapter.exchangeCredentials({ clientId: 'id', clientSecret: 'sec', region: 'evil.example' }),
    ).rejects.toThrow(REGIONS_MSG)
    await expect(
      adapter.exchangeCredentials({ clientId: ' ', clientSecret: 'sec', region: 'prod-us' }),
    ).rejects.toThrow('Conga Sign client ID and client secret are required.')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes with the client credentials and region stored on the connection', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await adapter.refreshCredentials({
      accessToken: 'old',
      extra: { region: 'prod-au', clientId: 'id', clientSecret: 'sec' },
    })
    expect(post.mock.calls[0][0]).toBe('https://login.congacloud.au/api/v1/auth/connect/token')
    expect(new URLSearchParams(String(post.mock.calls[0][1])).get('client_id')).toBe('id')
  })

  it('calls the API on the regional host stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter
      .getEnvelope({ accessToken: 'tok', extra: { region: 'prod-eu' } }, 'pkg1')
      .catch(() => undefined) // the transform of an empty package is not under test
    expect(baseURL()).toBe('https://rls.congacloud.eu/api/signconnector/v1')
  })

  it('refuses an unknown stored region instead of silently using prod-us', async () => {
    fakeHttp()
    await expect(
      adapter.getEnvelope({ accessToken: 'tok', extra: { region: 'mars-1' } }, 'pkg1'),
    ).rejects.toThrow(REGIONS_MSG)
  })
})
