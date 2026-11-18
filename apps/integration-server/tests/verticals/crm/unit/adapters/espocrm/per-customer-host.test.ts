/**
 * EspoCRM is self-hosted: every request goes to the customer's site URL
 * (docs.espocrm.com/development/api/: "GET
 * https://address_of_your_crm/api/v1/Contact/55643ca033f7ab4c5", "Client
 * implementations require specifying the Site URL"). The Connect Link form
 * used to collect only the API key, and the client then sent that key to
 * https://demo.espocrm.com.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { EspoCrmAdapter } from '../../../../../../src/verticals/crm/adapters/espocrm'
import { API_KEY, HOST, fakeEspo } from './fake-espocrm'

afterEach(() => vi.restoreAllMocks())

describe('EspoCRM site URL', () => {
  it('collects the site URL on the Connect Link form and stores it on extra', async () => {
    const adapter = new EspoCrmAdapter()
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['instanceUrl', true],
      ['apiKey', true],
    ])
    await expect(
      adapter.exchangeCredentials({ instanceUrl: ` ${HOST}/ `, apiKey: ` ${API_KEY} ` }),
    ).resolves.toEqual({ accessToken: API_KEY, extra: { instanceUrl: HOST } })
  })

  it('refuses a form with no site URL or no API key', async () => {
    const adapter = new EspoCrmAdapter()
    await expect(adapter.exchangeCredentials({ apiKey: API_KEY })).rejects.toThrow(/Site URL/)
    await expect(adapter.exchangeCredentials({ instanceUrl: HOST })).rejects.toThrow(/API key/)
  })

  it('sends requests to {siteUrl}/api/v1 with the X-Api-Key header', async () => {
    const fake = fakeEspo({ entities: { Contact: [{ id: 'c1' }] } })
    const rows = await new EspoCrmAdapter().listContacts(
      { accessToken: API_KEY, extra: { instanceUrl: `${HOST}/` } },
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['c1'])
    expect(fake.sent[0]!.origin + fake.sent[0]!.pathname).toBe(`${HOST}/api/v1/Contact`)
  })

  it('refuses a connection with no site URL before sending anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const adapter = new EspoCrmAdapter()
    for (const creds of [
      { accessToken: API_KEY },
      { accessToken: API_KEY, extra: { baseUrl: HOST } },
    ]) {
      await expect(
        adapter.listPipelines(creds, withPageSink({ page: 1, limit: 5 })),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'MISSING_INSTANCE_URL',
      })
      await expect(adapter.getContact(creds, 'c1')).rejects.toThrow(/instance URL/)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
