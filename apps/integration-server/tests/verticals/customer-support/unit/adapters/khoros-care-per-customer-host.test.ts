/**
 * The Khoros Care API (v1/v2) lives on the customer's own instance host,
 * `https://{instance}.response.lithium.com/api/v2`, and authenticates with
 * HTTP Basic credentials of a dedicated API user. There is no OAuth flow.
 *
 * The adapter collected a "company key" and a region and built
 * `https://{company}.app.lithium.com/api/v2` (or `{company}-eu.app…`), a host
 * pattern Khoros does not use for the Care API — the company key belongs to
 * the separate v3/Analytics gateway scheme. It also accepted any string as
 * that host label. The instance is now collected, normalised, validated
 * against `response.lithium.com`, stored in `credentials.extra`, and used by
 * the API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { KhorosCareAdapter } from '../../../../../src/verticals/customer-support/adapters/khoros-care'

afterEach(() => {
  vi.restoreAllMocks()
})

const LOGIN = { username: 'api-user', password: 'pw' }
const INSTANCE_MSG =
  'Khoros Care instance must be the name from your {instance}.response.lithium.com address.'

describe('KhorosCareAdapter per-customer instance', () => {
  const adapter = new KhorosCareAdapter()

  it('collects the instance and the API user credentials', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['instance', true],
      ['username', true],
      ['password', true],
    ])
  })

  it('normalises the instance and stores it in extra', async () => {
    const creds = await adapter.exchangeCredentials({
      ...LOGIN,
      instance: ' https://Acme.response.lithium.com/api/v2/ ',
    })
    expect(creds).toEqual({
      accessToken: Buffer.from('api-user:pw').toString('base64'),
      extra: { instance: 'acme' },
    })
  })

  it('rejects hosts outside response.lithium.com, blanks and a missing login', async () => {
    await expect(
      adapter.exchangeCredentials({ ...LOGIN, instance: 'acme.response.lithium.com.evil.example' }),
    ).rejects.toThrow(INSTANCE_MSG)
    await expect(
      adapter.exchangeCredentials({ ...LOGIN, instance: 'acme.app.lithium.com' }),
    ).rejects.toThrow(INSTANCE_MSG)
    await expect(adapter.exchangeCredentials({ ...LOGIN, instance: '  ' })).rejects.toThrow(
      'Khoros Care instance is required (e.g. acme for acme.response.lithium.com).',
    )
    await expect(
      adapter.exchangeCredentials({ instance: 'acme', username: 'api-user', password: '' }),
    ).rejects.toThrow('Khoros Care API username and password are required.')
  })

  it('calls the Care API on the instance stored with the credentials', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get: fail, post: fail } as never)
    await adapter
      .listTags({ accessToken: 'b64', extra: { instance: 'acme' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://acme.response.lithium.com/api/v2',
    )
  })

  it('refuses to send the credentials to an invalid stored instance', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(
      adapter.listTags({ accessToken: 'b64', extra: { instance: 'evil.example' } }, {}),
    ).rejects.toThrow(INSTANCE_MSG)
    expect(create).not.toHaveBeenCalled()
  })
})
