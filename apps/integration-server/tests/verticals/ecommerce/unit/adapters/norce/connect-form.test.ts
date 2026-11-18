/**
 * Norce Connect Link form — credential exchange and host confinement.
 *
 * Norce has no browser-redirect OAuth flow, so the Connect page collects
 * clientName/region/environment/clientId/clientSecret/applicationId directly
 * and `exchangeCredentials` mints the first token immediately. Docs:
 * https://docs.norce.io/api-reference/accessing-apis-with-oauth2-accounts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { NorceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/norce/index'

const VALID = {
  clientName: 'acme',
  region: 'se',
  environment: 'prod',
  clientId: 'client-123',
  clientSecret: 'secret-abc',
  applicationId: '1000',
}

describe('Norce Connect Link form', () => {
  let adapter: NorceAdapter

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('declares every field the client needs, secrets masked, environment closed-set', () => {
    adapter = new NorceAdapter()
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual([
      'applicationId',
      'clientId',
      'clientName',
      'clientSecret',
      'environment',
      'region',
    ])
    expect(byName['clientSecret']!.type).toBe('password')
    expect(byName['environment']!.type).toBe('select')
    expect(byName['environment']!.options?.map((o) => o.value).sort()).toEqual([
      'playground',
      'prod',
      'stage',
    ])
    for (const f of fields) expect(f.required).toBe(true)
  })

  it.each([
    ['clientName', /Client name is required/],
    ['region', /Region is required/],
    ['clientId', /OAuth2 client ID is required/],
    ['clientSecret', /OAuth2 client secret is required/],
    ['applicationId', /Application ID is required/],
  ])('rejects a blank %s', async (field, message) => {
    adapter = new NorceAdapter()
    await expect(adapter.exchangeCredentials({ ...VALID, [field]: '   ' })).rejects.toThrow(
      message,
    )
  })

  it('rejects an unknown environment', async () => {
    adapter = new NorceAdapter()
    await expect(
      adapter.exchangeCredentials({ ...VALID, environment: 'sandbox' }),
    ).rejects.toThrow(/Environment must be one of/)
  })

  it('rejects a non-numeric applicationId', async () => {
    adapter = new NorceAdapter()
    await expect(
      adapter.exchangeCredentials({ ...VALID, applicationId: 'abc' }),
    ).rejects.toThrow(/Application ID must be numeric/)
  })

  it.each([
    ['clientName', 'acme.evil.example'],
    ['clientName', 'acme/evil'],
    ['region', 'se.evil.example'],
  ])('rejects a %s that is not a bare DNS label (host-confinement)', async (field, value) => {
    adapter = new NorceAdapter()
    await expect(adapter.exchangeCredentials({ ...VALID, [field]: value })).rejects.toThrow(
      /must contain only letters, digits, and hyphens/,
    )
  })

  it('mints a token and stores everything refreshCredentials needs, confined to *.norce.tech', async () => {
    adapter = new NorceAdapter()
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok_1', expires_in: 3600 } })

    const creds = await adapter.exchangeCredentials(VALID)

    expect(post).toHaveBeenCalledWith(
      'https://acme.api-se.norce.tech/identity/1.0/connect/token',
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    )
    expect(creds.accessToken).toBe('tok_1')
    expect(creds.extra).toEqual({
      host: 'acme.api-se.norce.tech',
      clientName: 'acme',
      region: 'se',
      environment: 'prod',
      clientId: 'client-123',
      clientSecret: 'secret-abc',
      applicationId: '1000',
    })
  })

  it('includes the environment segment in the host for non-prod environments', async () => {
    adapter = new NorceAdapter()
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok_stage', expires_in: 3600 },
    })
    const creds = await adapter.exchangeCredentials({ ...VALID, environment: 'stage' })
    expect(creds.extra?.['host']).toBe('acme.api-se.stage.norce.tech')
  })
})
