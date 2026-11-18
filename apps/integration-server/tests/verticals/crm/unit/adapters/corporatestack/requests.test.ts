/**
 * CorporateStack reads against the vendor's only first-party API text, the
 * "Website Form Integration with CorporateStack CRM" guide,
 * https://corporatestack.com/website-form-integration-with-corporatestack-crm/:
 *
 *   "This guide explains how to connect your WordPress website to CorporateStack
 *    CRM using a form and API connection."
 *   "API details provided by CorporateStack: API URL (Endpoint) Authorization
 *    Header (API Key / Token)"
 *   "Method: POST"
 *
 * It documents one POST that creates a lead (firstName, email, mobile,
 * remarks) at a per-customer URL, and no list or read-by-id endpoint for any
 * resource. The site's sitemap has no developer or API reference page. Every
 * read therefore refuses with 501 NOT_SUPPORTED before sending a request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { CorporateStackAdapter } from '../../../../../../src/verticals/crm/adapters/corporatestack/index'

const CREDS = { accessToken: 'key' }

afterEach(() => {
  vi.restoreAllMocks()
})

function spyFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(JSON.stringify({ data: [{ id: '1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

const adapter = new CorporateStackAdapter()

const LISTS = [
  [
    'listContacts',
    'contacts',
    () => adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5 })),
  ],
  [
    'listCompanies',
    'companies',
    () => adapter.listCompanies(CREDS, withPageSink({ page: 1, limit: 5 })),
  ],
  ['listDeals', 'deals', () => adapter.listDeals(CREDS, withPageSink({ page: 1, limit: 5 }))],
  [
    'listPipelines',
    'pipelines',
    () => adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 5 })),
  ],
  [
    'listActivities',
    'activities',
    () => adapter.listActivities(CREDS, withPageSink({ page: 1, limit: 5 })),
  ],
  ['listNotes', 'notes', () => adapter.listNotes(CREDS, withPageSink({ page: 1, limit: 5 }))],
] as const

const GETS = [
  ['getContact', 'contacts', () => adapter.getContact(CREDS, '1')],
  ['getCompany', 'companies', () => adapter.getCompany(CREDS, '1')],
  ['getDeal', 'deals', () => adapter.getDeal(CREDS, '1')],
  ['getActivity', 'activities', () => adapter.getActivity(CREDS, '1')],
  ['getNote', 'notes', () => adapter.getNote(CREDS, '1')],
] as const

describe('corporatestack reads', () => {
  it.each(LISTS)(
    '%s refuses with 501 NOT_SUPPORTED and sends no request',
    async (_name, resource, call) => {
      const spy = spyFetch()
      await expect(call()).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining(`CorporateStack cannot list ${resource}`),
      })
      expect(spy).not.toHaveBeenCalled()
    },
  )

  it.each(GETS)(
    '%s refuses with 501 NOT_SUPPORTED and sends no request',
    async (_name, resource, call) => {
      const spy = spyFetch()
      await expect(call()).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining(`CorporateStack cannot read ${resource}`),
      })
      expect(spy).not.toHaveBeenCalled()
    },
  )

  it('refuses a later page too, never answering it as an empty last page', async () => {
    const spy = spyFetch()
    await expect(
      adapter.listPipelines(CREDS, withPageSink({ page: 3, limit: 50 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(spy).not.toHaveBeenCalled()
  })
})
