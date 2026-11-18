/**
 * SignDesk signers, documents and audit trail: refused before any request.
 *
 * All three used to read `GET /api/esign/requests/{id}` (signers, documents)
 * or `GET /api/esign/requests/{id}/audit-trail` on api.signdesk.in. No public
 * first-party source documents either path: the reference at
 * https://docs.melento.ai/ is behind an OTP login and serves its pages
 * encrypted. The live host answers both paths — and every method on them, and
 * `/api/esign` itself — with Express's route-level 404 "Cannot GET …", which
 * is sent before any authentication, so the routes do not exist.
 *
 * The audit-trail method also swallowed that error and built entries from
 * request timestamps, i.e. synthetic records. All six reads now refuse with
 * 501 NOT_SUPPORTED and send nothing — pinned at the adapter's client AND at
 * the transport (axios and fetch), so a refusal that sends through raw axios
 * before throwing also fails.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SigndeskClient } from '../../../../../../src/verticals/docsign/adapters/signdesk/client'
import { SigndeskAdapter } from '../../../../../../src/verticals/docsign/adapters/signdesk'

const CREDS = {
  accessToken: 'lic',
  extra: { applicationId: 'app', licenseKey: 'lic', baseUrl: 'https://api.signdesk.in' },
} as Credentials
const adapter = new SigndeskAdapter()

afterEach(() => vi.restoreAllMocks())

const TRANSPORT_METHODS = ['request', 'get', 'post', 'put', 'patch', 'delete', 'create'] as const

function spyTransport() {
  const get = vi.spyOn(SigndeskClient.prototype, 'get').mockResolvedValue({
    request: {
      signatories: [{ signatory_id: 's1', email: 'a@example.com', signed_on: '2026-01-01' }],
      documents: [{ document_name: 'x.pdf' }],
      created_on: '2026-01-01',
    },
  } as never)
  const post = vi.spyOn(SigndeskClient.prototype, 'post').mockResolvedValue({} as never)
  const wire = TRANSPORT_METHODS.map((m) =>
    vi.spyOn(axios, m).mockImplementation((() => {
      throw new Error(`axios.${m} must not be called`)
    }) as never),
  )
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('fetch must not be called'))
  return { get, post, wire, fetchSpy }
}

const REQUEST = 'Cannot GET /api/esign/requests/{id}" (HTTP 404)'
const AUDIT = 'Cannot GET /api/esign/requests/{id}/audit-trail" (HTTP 404)'

const CASES: Array<[string, RegExp, string, () => Promise<unknown>]> = [
  [
    'listSigners',
    /^SignDesk cannot list signers: /,
    REQUEST,
    () => adapter.listSigners(CREDS, 'REQ1', { page: 1, limit: 2 }),
  ],
  [
    'getSigner',
    /^SignDesk cannot get signers: /,
    REQUEST,
    () => adapter.getSigner(CREDS, 'REQ1:0'),
  ],
  [
    'listDocuments',
    /^SignDesk cannot list documents: /,
    REQUEST,
    () => adapter.listDocuments(CREDS, 'REQ1', { page: 1, limit: 2 }),
  ],
  [
    'getDocument',
    /^SignDesk cannot get documents: /,
    REQUEST,
    () => adapter.getDocument(CREDS, 'REQ1:0'),
  ],
  [
    'listAuditTrailEntries',
    /^SignDesk cannot list audit trail entries: /,
    AUDIT,
    () => adapter.listAuditTrailEntries(CREDS, 'REQ1', { page: 1, limit: 2 }),
  ],
  [
    'getAuditTrailEntry',
    /^SignDesk cannot get audit trail entries: /,
    AUDIT,
    () => adapter.getAuditTrailEntry(CREDS, 'REQ1:0'),
  ],
]

describe('SigndeskAdapter refuses reads on the unrouted /api/esign/requests paths', () => {
  for (const [name, message, evidence, call] of CASES) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { get, post, wire, fetchSpy } = spyTransport()
      const err = await call().then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(err).toBeInstanceOf(Error)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(message)
      expect((err as Error).message).toContain(evidence)
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      for (const spy of wire) expect(spy).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }

  it('listAuditTrailEntries no longer synthesises entries from request timestamps', async () => {
    spyTransport()
    await expect(adapter.listAuditTrailEntries(CREDS, 'REQ1', {})).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    })
  })
})
