/**
 * Folk Connect Link auth, from the first-party docs (2026-09-28):
 *
 *   api-reference/authentication.md: API keys are managed "in your workspace
 *     settings under the 'API' section", and requests "include the API key in
 *     the `Authorization` header using the bearer token scheme".
 *
 * Folk has no OAuth flow, so the platform is `api_key` and the adapter must
 * collect the key through credentialFields / exchangeCredentials.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FolkAdapter } from '../../../../../../src/verticals/crm/adapters/folk/index'
import { PLATFORMS } from '../../../../../../src/verticals/crm/platforms/metadata'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Folk auth', () => {
  it('is labelled api_key, so connect shows the credential form', () => {
    expect(PLATFORMS.find((p) => p.slug === 'folk')?.auth_type).toBe('api_key')
  })

  it('collects a single required API key', () => {
    const fields = new FolkAdapter().credentialFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'apiKey', type: 'password', required: true })
  })

  it('stores the trimmed key as the access token', async () => {
    const creds = await new FolkAdapter().exchangeCredentials({ apiKey: '  folk_key_abc  ' })
    expect(creds).toEqual({ accessToken: 'folk_key_abc' })
  })

  it('rejects an empty key', async () => {
    await expect(new FolkAdapter().exchangeCredentials({ apiKey: '   ' })).rejects.toThrow(
      /required/,
    )
  })

  it('sends the exchanged key as the Bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { items: [], pagination: {} } }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new FolkAdapter()
    const creds = await adapter.exchangeCredentials({ apiKey: 'folk_key_abc' })
    await adapter.listContacts(creds, { limit: 10 })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer folk_key_abc')
  })
})
