/**
 * A Genesys Cloud organisation lives in one region, and each region has its
 * own login host (authorize + token) and API host. The region is the
 * customer's, not the deployment's.
 *
 * The adapter read it from deployment config — which the admin UI cannot set —
 * and collected it on `credentialFields()`, which the Connect flow never calls
 * for an oauth2 adapter. Every non-US-East organisation was sent to the wrong
 * login host. It also accepted any string as a "host", so a typed value became
 * the host that received the client secret.
 *
 * Now the region is a closed-set `oauthField`, validated against the known
 * regions, stored in `credentials.extra.region`, and read by the API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { GenesysCloudAdapter } from '../../../../../src/verticals/customer-support/adapters/genesys-cloud'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/customer-support/genesys-cloud/callback',
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

describe('GenesysCloudAdapter per-customer region', () => {
  const adapter = new GenesysCloudAdapter(CFG)

  it('declares the region as a required closed-set oauthField', () => {
    const fields = adapter.oauthFields()
    expect(fields).toEqual([
      expect.objectContaining({ name: 'region', type: 'select', required: true }),
    ])
    const values = (fields[0]!.options ?? []).map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['us-east-1', 'eu-west-1']))
  })

  it('no longer relies on credentialFields, which the oauth2 flow never calls', () => {
    expect((adapter as { credentialFields?: unknown }).credentialFields).toBeUndefined()
  })

  it('builds the authorize URL on the chosen region’s login host', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { region: 'eu-west-1' }))
    expect(u.host).toBe('login.mypurecloud.ie')
    expect(u.pathname).toBe('/oauth/authorize')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('client_id')).toBe('cid')
  })

  it.each([
    ['us-west-2', 'login.usw2.pure.cloud'],
    ['eu-west-2', 'login.euw2.pure.cloud'],
    ['ap-southeast-1', 'login.apse1.pure.cloud'],
    ['ap-southeast-2', 'login.mypurecloud.com.au'],
    ['me-central-1', 'login.mec1.pure.cloud'],
  ])('maps %s to its documented login host %s', (region, host) => {
    expect(new URL(adapter.getAuthUrl('st', undefined, undefined, { region })).host).toBe(host)
  })

  it('throws, instead of guessing a region, when none is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Genesys Cloud region is required.')
  })

  it('rejects an unknown region or a free-form host before any request', async () => {
    expect(() => adapter.getAuthUrl('st', undefined, undefined, { region: 'mars-1' })).toThrow(
      'Genesys Cloud region "mars-1" is not a recognised region.',
    )
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { region: 'evil.example' }),
    ).rejects.toThrow('Genesys Cloud region "evil.example" is not a recognised region.')
    expect(post).not.toHaveBeenCalled()
  })

  it('exchanges on the region’s login host and stores the region in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', token_type: 'bearer', expires_in: 86400 },
    })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      region: ' EU-WEST-1 ',
    })
    expect(post.mock.calls[0]![0]).toBe('https://login.mypurecloud.ie/oauth/token')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ region: 'eu-west-1' })
  })

  it('calls the API on the region stored with the credentials', async () => {
    const create = offlineCreate()
    await adapter
      .listTickets({ accessToken: 'tok', extra: { region: 'eu-west-1' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://api.mypurecloud.ie/api/v2',
    )
  })

  it('still reads connections stored with the legacy host-suffix form', async () => {
    const create = offlineCreate()
    await adapter
      .listTickets({ accessToken: 'tok', extra: { region: 'mypurecloud.com' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://api.mypurecloud.com/api/v2',
    )
  })

  it('refuses to send the bearer token to an unrecognised stored host', async () => {
    const create = offlineCreate()
    await expect(
      adapter.listTickets({ accessToken: 'tok', extra: { region: 'evil.example' } }, {}),
    ).rejects.toThrow('Genesys Cloud region "evil.example" is not a recognised region.')
    expect(create).not.toHaveBeenCalled()
  })
})
