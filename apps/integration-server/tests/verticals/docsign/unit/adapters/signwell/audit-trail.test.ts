/**
 * SignWell documents no audit-trail endpoint.
 *
 * The adapter used to call `GET /api/v1/documents/{id}/audit_trail`, which
 * is not in SignWell's reference index (https://developers.signwell.com/llms.txt).
 * The only audit record SignWell exposes is the audit
 * page inside the completed PDF: "Whether to include the audit page as part
 * of the document." (https://developers.signwell.com/reference/getcompletedpdf.md).
 * A PDF page is not a list of events, so both audit-trail methods refuse
 * with 501 NOT_SUPPORTED before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SignWellClient } from '../../../../../../src/verticals/docsign/adapters/signwell/client'
import { SignWellAdapter } from '../../../../../../src/verticals/docsign/adapters/signwell'

const CREDS = { accessToken: 'sw_key' } as Credentials
const adapter = new SignWellAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

function spyAllTransport() {
  const fail = async () => {
    throw new Error('no request may be sent')
  }
  return [
    vi.spyOn(SignWellClient.prototype, 'get').mockImplementation(fail),
    vi.spyOn(SignWellClient.prototype, 'post').mockImplementation(fail),
    vi.spyOn(SignWellClient.prototype, 'put').mockImplementation(fail),
    vi.spyOn(SignWellClient.prototype, 'delete').mockImplementation(fail),
    vi.spyOn(axios, 'create'),
  ]
}

describe('SignWellAdapter audit trail refuses: no documented endpoint', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const spies = spyAllTransport()
    const err = await adapter
      .listAuditTrailEntries(CREDS, 'doc_1', withPageSink({ page: 1, limit: 10 }))
      .then(
        () => undefined,
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
    expect(err).toBeInstanceOf(Error)
    expect(err?.statusCode).toBe(501)
    expect(err?.code).toBe('NOT_SUPPORTED')
    expect(err?.message).toMatch(/^SignWell cannot list audit-trail entries: /)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const spies = spyAllTransport()
    const err = await adapter.getAuditTrailEntry(CREDS, 'doc_1:0').then(
      () => undefined,
      (e: unknown) => e as Error & { statusCode?: number; code?: string },
    )
    expect(err).toBeInstanceOf(Error)
    expect(err?.statusCode).toBe(501)
    expect(err?.code).toBe('NOT_SUPPORTED')
    expect(err?.message).toMatch(/^SignWell cannot get audit-trail entries: /)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})
