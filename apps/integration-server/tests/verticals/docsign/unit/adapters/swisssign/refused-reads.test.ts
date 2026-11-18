/**
 * SwissSign reads: refused before any request.
 *
 * Every read used to call `https://api.swisssign.com/v1/documents…` or
 * `/v1/templates…`. That host does not exist (NXDOMAIN, checked 2026-09-24),
 * and SwissSign publishes no API reference: its REST-API page
 * (https://www.swisssign.com/en/digital-signatures/rest-api.html) sends
 * integrators to a contact form — "Tell us about your functional and technical
 * use case – from KYC to employment contracts and API specifications,
 * authentication flows and system architecture." The `api/organizations/…/rooms`
 * paths the triage found are the private backend of the sign.swisssign.com web
 * console (HTTP Basic realm, no API-key scheme, no documented response shape),
 * not an integrator API.
 *
 * The audit-trail list also swallowed every error into `[]`. All reads now
 * refuse with 501 NOT_SUPPORTED and send nothing — pinned at the adapter's
 * client AND at the transport (axios and fetch).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SwissSignClient } from '../../../../../../src/verticals/docsign/adapters/swisssign/client'
import { SwissSignAdapter } from '../../../../../../src/verticals/docsign/adapters/swisssign'

const CREDS = { accessToken: 'key', extra: {} } as Credentials
const adapter = new SwissSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

const TRANSPORT_METHODS = ['request', 'get', 'post', 'put', 'patch', 'delete', 'create'] as const

function spyTransport() {
  const get = vi.spyOn(SwissSignClient.prototype, 'get').mockResolvedValue({
    id: 'doc_1',
    status: 'COMPLETED',
    documents: [{ id: 'd1' }],
    signers: [{ id: 's1', email: 'a@example.com' }],
    templates: [{ id: 't1', name: 'T' }],
    events: [{ type: 'signed', timestamp: '2026-01-01T00:00:00Z' }],
  } as never)
  const post = vi.spyOn(SwissSignClient.prototype, 'post').mockResolvedValue({} as never)
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

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listEnvelopes',
    /^SwissSign cannot list envelopes: /,
    () => adapter.listEnvelopes(CREDS, { page: 1, limit: 2 }),
  ],
  ['getEnvelope', /^SwissSign cannot get envelopes: /, () => adapter.getEnvelope(CREDS, 'doc_1')],
  [
    'listSigners',
    /^SwissSign cannot list signers: /,
    () => adapter.listSigners(CREDS, 'doc_1', { page: 1, limit: 2 }),
  ],
  ['getSigner', /^SwissSign cannot get signers: /, () => adapter.getSigner(CREDS, 's1')],
  [
    'listDocuments',
    /^SwissSign cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'doc_1', { page: 1, limit: 2 }),
  ],
  ['getDocument', /^SwissSign cannot get documents: /, () => adapter.getDocument(CREDS, 'd1')],
  [
    'listAuditTrailEntries',
    /^SwissSign cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'doc_1', { page: 1, limit: 2 }),
  ],
  [
    'getAuditTrailEntry',
    /^SwissSign cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'doc_1:0'),
  ],
  [
    'listTemplates',
    /^SwissSign cannot list templates: /,
    () => adapter.listTemplates(CREDS, { page: 1, limit: 2 }),
  ],
  ['getTemplate', /^SwissSign cannot get templates: /, () => adapter.getTemplate(CREDS, 't1')],
]

describe('SwissSign reads refuse before sending', () => {
  for (const [name, message, call] of CASES) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { get, post, wire, fetchSpy } = spyTransport()
      const err = (await call().then(
        () => null,
        (e: unknown) => e,
      )) as (Error & { statusCode?: number; code?: string }) | null
      expect(err).not.toBeNull()
      expect(err!.statusCode).toBe(501)
      expect(err!.code).toBe('NOT_SUPPORTED')
      expect(err!.message).toMatch(message)
      expect(err!.message).toContain('API specifications')
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      for (const spy of wire) expect(spy).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }
})
