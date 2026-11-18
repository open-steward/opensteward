/**
 * Catalyst request shapes against the first-party "Catalyst API v1" article,
 * https://help.catalyst.io/hc/en-us/articles/34021477455508-Catalyst-API-v1
 * (served as JSON at
 * https://help.catalyst.io/api/v2/help_center/en-us/articles/34021477455508.json):
 *
 *   "Base URL: https://api.catalyst.io"
 *   "Lists accounts | GET /accounts"
 *   "Shows account | GET /accounts/{account_id}"
 *
 * Its endpoint tables list /accounts, /emails, /health_scores, /notes,
 * /playbooks, /tasks and /unsubscribed, and no contact path, so the contact
 * reads refuse before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { CatalystAdapter } from '../../../../../../src/verticals/crm/adapters/catalyst/index'

const CREDS = { accessToken: 'key' }

function captureFetch(body: unknown) {
  const sent: { url: URL; method: string }[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    sent.push({ url: new URL(String(input)), method: init?.method ?? 'GET' })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { sent, spy }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('catalyst request shapes', () => {
  it('lists accounts at the documented base URL with no /v1 segment', async () => {
    const { sent } = captureFetch({ data: [{ id: 'a1', name: 'Acme' }] })
    await new CatalystAdapter().listCompanies(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.method).toBe('GET')
    expect(sent[0]!.url.origin).toBe('https://api.catalyst.io')
    expect(sent[0]!.url.pathname).toBe('/accounts')
  })

  it('reads one account at GET /accounts/{account_id} on the documented base URL', async () => {
    const { sent } = captureFetch({ id: 'a1', name: 'Acme' })
    const company = await new CatalystAdapter().getCompany(CREDS, 'a1')
    expect(company.id).toBe('a1')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url.origin).toBe('https://api.catalyst.io')
    expect(sent[0]!.url.pathname).toBe('/accounts/a1')
  })

  // The envelope is not publicly documented. A body without a `data` array must
  // fail loudly, never read as an empty last page (the sync would treat the
  // collection as complete and drop its cached rows).
  it.each([
    ['a bare array', [{ id: 'a1', name: 'Acme' }]],
    ['an object without data', { accounts: [{ id: 'a1', name: 'Acme' }] }],
  ])('listCompanies throws 502 on %s instead of reporting an empty page', async (_label, body) => {
    captureFetch(body)
    const params = withPageSink({ page: 1, limit: 5 })
    await expect(new CatalystAdapter().listCompanies(CREDS, params)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  })

  it('declares the documented max page size of 100', () => {
    expect(new CatalystAdapter().capabilities.maxPageSize).toBe(100)
  })
})

describe('catalyst contact reads are unsupported', () => {
  it('listContacts throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { spy } = captureFetch({ data: [] })
    await expect(
      new CatalystAdapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('getContact throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { spy } = captureFetch({ id: 'c1' })
    await expect(new CatalystAdapter().getContact(CREDS, 'c1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
