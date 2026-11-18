import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { SalesflareAdapter } from '../../../../../../src/verticals/crm/adapters/salesflare/index'

/**
 * Salesflare has no notes collection (https://api.salesflare.com/openapi.json,
 * the spec https://api.salesflare.com/docs loads). No path contains "note";
 * internal notes are messages:
 *
 *   "/messages":{"post":{"summary":"Create an internal note"
 *   "/messages/{message_id}":{"put":{"summary":"Update an internal note"  (plus delete)
 *   "/accounts/{account_id}/messages":{"get":{"summary":"List an account's messages"
 *
 * The only list is scoped to one account, and there is no GET /messages/{id}.
 * The adapter used to call GET /notes and GET /notes/{id}, which do not exist.
 * Both now refuse with 501 before sending anything.
 */

const creds = { accessToken: 'tok' }
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('salesflare notes', () => {
  it('listNotes refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await new SalesflareAdapter()
      .listNotes(creds, withPageSink({ page: 1, limit: 10 }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/^Salesflare cannot list notes/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getNote refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await new SalesflareAdapter().getNote(creds, '42').catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/^Salesflare cannot read a note/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
