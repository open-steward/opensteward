/**
 * Affinity companies live at /v2/companies, not /v2/organizations.
 *
 * https://developer.affinity.co/api-reference/openapi.json (2026-09-17) has
 * no path matching "organi"; it documents
 *   GET /v2/companies              "Paginate through Companies in Affinity."
 *   GET /v2/companies/{companyId}  "Returns basic information and
 *                                   non-list-specific field data on the
 *                                   requested Company."
 * Paging over /v2/companies is covered with the other cursor lists in
 * paging.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { _resetCursorPager, withPageSink } from '@opensteward/shared'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { AffinityAdapter } from '../../../../../../src/verticals/crm/adapters/affinity/index'

const CREDS = { accessToken: 'affinity_test' }

/** Verbatim: `CompanyPaged.example.data[0]`. */
const HORIZON = {
  id: 1,
  name: 'Horizon Technologies',
  domain: 'horizontech.com',
  domains: ['horizontech.com'],
  isGlobal: false,
  fields: [],
}

function fake(handler: (url: URL) => unknown) {
  const sent: { method: string; url: URL }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    sent.push({ method, url })
    if (method !== 'GET') return new Response('write', { status: 405 })
    const body = handler(url)
    if (body === undefined) return new Response(`unexpected ${url.pathname}`, { status: 404 })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return sent
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('affinity companies (v2)', () => {
  it('listCompanies reads GET /v2/companies and maps the documented example', async () => {
    const sent = fake((url) =>
      url.pathname === '/v2/companies'
        ? { data: [HORIZON], pagination: { prevUrl: null, nextUrl: null } }
        : undefined,
    )
    const rows = await new AffinityAdapter().listCompanies(
      CREDS,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(sent.map((s) => s.url.pathname)).toEqual(['/v2/companies'])
    expect([...sent[0]!.url.searchParams.keys()].sort()).toEqual(['limit'])
    expect(rows.map((r) => CompanySchema.parse(r))).toEqual([
      { id: '1', name: 'Horizon Technologies', domain: 'horizontech.com', metadata: HORIZON },
    ])
  })

  it('getCompany reads GET /v2/companies/{companyId}', async () => {
    const sent = fake((url) => (url.pathname === '/v2/companies/1' ? HORIZON : undefined))
    const row = await new AffinityAdapter().getCompany(CREDS, '1')
    expect(sent.map((s) => `${s.method} ${s.url.pathname}${s.url.search}`)).toEqual([
      'GET /v2/companies/1',
    ])
    expect(CompanySchema.parse(row).name).toBe('Horizon Technologies')
  })
})
