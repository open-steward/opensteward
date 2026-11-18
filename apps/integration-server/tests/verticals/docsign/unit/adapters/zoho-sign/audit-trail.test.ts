import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ZohoSignClient } from '../../../../../../src/verticals/docsign/adapters/zoho-sign/client'
import { ZohoSignAdapter } from '../../../../../../src/verticals/docsign/adapters/zoho-sign'

/**
 * Zoho Sign documents no audit-log endpoint. Its first-party OpenAPI
 * (https://api.swaggerhub.com/apis/zohosign/zohosign_api/1.0.0) lists every
 * /requests/{Request_Id} sub-path — submit, pdf, documents/{Document_Id}/pdf,
 * completioncertificate, fielddata, recall, remind, delete — and none of them
 * is an audit log. The only audit artifact is
 * https://www.zoho.com/sign/api/document-managment/download-completion-certificate.html:
 * "Retrieves the completion certificate pdf content."
 *
 * So both audit-trail methods refuse with 501 NOT_SUPPORTED before any
 * request is sent.
 */

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new ZohoSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Stubs every ZohoSignClient verb (get, post, put, delete) with a resolving
 * fake, so any request the adapter makes is counted, never reaches the
 * network, and cannot be hidden behind a caught error.
 */
function spyAll() {
  const verbs = (['get', 'post', 'put', 'delete'] as const).map((verb) =>
    vi.spyOn(ZohoSignClient.prototype, verb).mockResolvedValue({} as never),
  )
  return () => verbs.reduce((n, spy) => n + spy.mock.calls.length, 0)
}

describe('ZohoSignAdapter audit trail is not supported', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = spyAll()
    await expect(
      adapter.listAuditTrailEntries(CREDS, 'req_1', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('Zoho Sign cannot list audit-trail entries'),
    })
    expect(calls()).toBe(0)
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = spyAll()
    await expect(adapter.getAuditTrailEntry(CREDS, 'req_1:0')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('Zoho Sign cannot list audit-trail entries'),
    })
    expect(calls()).toBe(0)
  })
})
