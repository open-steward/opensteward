/**
 * Synder Connect Link auth, from https://importer.synder.com/apidocs
 * (fetched 2026-09-28): a token generated under Account → API Keys, sent as
 * "a Bearer token in the `Authorization` header". No OAuth flow for API
 * callers, so the platform is `api_key`.
 */
import { describe, it, expect } from 'vitest'
import { SynderAdapter } from '../../../../../../src/verticals/accounting/adapters/synder/index'
import { PLATFORMS } from '../../../../../../src/verticals/accounting/platforms/metadata'

describe('Synder auth', () => {
  it('is labelled api_key, so connect shows the credential form', () => {
    expect(PLATFORMS.find((p) => p.slug === 'synder')?.auth_type).toBe('api_key')
  })

  it('collects one required API key and stores it as the access token', async () => {
    const adapter = new SynderAdapter()
    const fields = adapter.credentialFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'apiKey', required: true })
    await expect(adapter.exchangeCredentials({ apiKey: ' syn_key ' })).resolves.toEqual({
      accessToken: 'syn_key',
    })
  })
})
