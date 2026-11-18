import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KaptureCrmAdapter } from '../../../../../../src/verticals/crm/adapters/kapture-crm/index'

/**
 * Kapture's first-party API docs (https://dev.kapture.cx/kapture-api/llms.txt)
 * document only Ticket, Customer, Order and FAQ endpoints. No reads for
 * contacts, companies, deals, pipelines, activities or notes are servable from
 * a connection here:
 *   - the only customer list, "Pull Customer API by Date Range", requires
 *     `cm_id` ("The Acount id which is unique.", Mandatory: Yes) and a
 *     createStartDate/createEndDate window ("at one hit we can pull a data of
 *     max 24 hours"), and the connection carries no cm_id;
 *   - deals, pipelines, activities and notes have no endpoint at all.
 * Every one of these reads must refuse with 501 NOT_SUPPORTED and send nothing.
 */

const creds = { accessToken: 'k-1', extra: { subdomain: 'acme' } }

let calls = 0
beforeEach(() => {
  calls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      calls++
      return new Response(JSON.stringify({ message: [], status: 'success' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const PAGE = { page: 1, limit: 10 }

const CASES: [string, (a: KaptureCrmAdapter) => Promise<unknown>, RegExp][] = [
  ['listContacts', (a) => a.listContacts(creds, PAGE), /cm_id/],
  [
    'listContacts with updatedAfter',
    (a) => a.listContacts(creds, { ...PAGE, updatedAfter: new Date('2024-05-01T00:00:00Z') }),
    /cm_id/,
  ],
  ['getContact', (a) => a.getContact(creds, '209432475'), /contact/],
  ['listCompanies', (a) => a.listCompanies(creds, PAGE), /cm_id/],
  ['listDeals', (a) => a.listDeals(creds, PAGE), /deal/],
  ['getDeal', (a) => a.getDeal(creds, '1'), /deal/],
  ['listPipelines', (a) => a.listPipelines(creds, PAGE), /pipeline/],
  ['listActivities', (a) => a.listActivities(creds, PAGE), /activit/],
  ['getActivity', (a) => a.getActivity(creds, '1'), /activit/],
  ['listNotes', (a) => a.listNotes(creds, PAGE), /note/],
  ['getNote', (a) => a.getNote(creds, '1'), /note/],
]

describe('kapture-crm refusals: 501 NOT_SUPPORTED before any request', () => {
  it.each(CASES)('%s refuses', async (_name, call, reason) => {
    await expect(call(new KaptureCrmAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(reason),
    })
    expect(calls).toBe(0)
  })

  it('refuses even when the connection has no subdomain (no client is built)', async () => {
    await expect(
      new KaptureCrmAdapter().listContacts({ accessToken: 'k' }, PAGE),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toBe(0)
  })
})
