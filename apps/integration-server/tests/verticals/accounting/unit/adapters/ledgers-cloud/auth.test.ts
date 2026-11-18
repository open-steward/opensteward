/**
 * LEDGERS.Cloud Connect Link auth, from https://ledgers.readme.io/reference/authentication-1
 * (fetched 2026-09-28):
 *
 *   POST https://in-api.ledgers.cloud/v3/login  { "email", "password" }
 *   200 → { "status": 200, "api_token": "…" }   "A token is valid for 24 hours."
 *   security scheme: apiKey in header "x-api-key"
 *
 * No authorization-code flow is documented, so the platform is `session`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { LedgersCloudAdapter } from '../../../../../../src/verticals/accounting/adapters/ledgers-cloud/index'
import { PLATFORMS } from '../../../../../../src/verticals/accounting/platforms/metadata'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LEDGERS.Cloud auth', () => {
  it('is labelled session, so connect shows the credential form', () => {
    expect(PLATFORMS.find((p) => p.slug === 'ledgers-cloud')?.auth_type).toBe('session')
  })

  it('logs in with the API key header and stores the documented api_token', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { status: 200, api_token: 'tok_123' } })
    const creds = await new LedgersCloudAdapter().exchangeCredentials({
      apiKey: ' key_abc ',
      email: 'a@example.com',
      password: 'pw',
    })
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://in-api.ledgers.cloud/v3/login')
    expect(body).toEqual({ email: 'a@example.com', password: 'pw' })
    expect((config?.headers as Record<string, string>)['x-api-key']).toBe('key_abc')
    expect(creds.accessToken).toBe('tok_123')
    expect(creds.extra).toMatchObject({ apiKey: 'key_abc', email: 'a@example.com' })
  })

  it('rejects a login response without a token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { status: 400, msg: 'invalid' } })
    await expect(
      new LedgersCloudAdapter().exchangeCredentials({
        apiKey: 'k',
        email: 'a@example.com',
        password: 'pw',
      }),
    ).rejects.toThrow(/did not return a token/)
  })
})
