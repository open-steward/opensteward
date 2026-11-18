/**
 * LuxTrust publishes no API reference for its e-signature platform.
 *
 * https://www.luxtrust.com/en/professionals/our-digital-solutions/sign-electronically
 * says only "Its services and modules are fully accessible via a set of APIs
 * or through a provided user interface" and ends with "Are you interested to
 * know more about our qualified e-signature platform?" (a contact form). The
 * repository at https://www.luxtrust.com/en/repository holds certificate and
 * signature policies, not an API. The adapter's host, api.luxtrust.com, has no
 * DNS A record, and developer.luxtrust.com / docs.luxtrust.com do not resolve.
 *
 * Every read therefore refuses with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { LuxTrustClient } from '../../../../../../src/verticals/docsign/adapters/luxtrust/client'
import { LuxTrustAdapter } from '../../../../../../src/verticals/docsign/adapters/luxtrust'

const CREDS = { accessToken: 'lt_key', extra: {} } as Credentials
const adapter = new LuxTrustAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    get: vi.spyOn(LuxTrustClient.prototype, 'get'),
    post: vi.spyOn(LuxTrustClient.prototype, 'post'),
    create: vi.spyOn(axios, 'create'),
  }
}

const params = () => withPageSink({ page: 2, limit: 2 })

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listEnvelopes',
    /^LuxTrust cannot list envelopes: /,
    () => adapter.listEnvelopes(CREDS, params()),
  ],
  ['getEnvelope', /^LuxTrust cannot get envelopes: /, () => adapter.getEnvelope(CREDS, 'doc_1')],
  [
    'listSigners',
    /^LuxTrust cannot list signers: /,
    () => adapter.listSigners(CREDS, 'doc_1', params()),
  ],
  ['getSigner', /^LuxTrust cannot get signers: /, () => adapter.getSigner(CREDS, 's_1')],
  [
    'listDocuments',
    /^LuxTrust cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'doc_1', params()),
  ],
  ['getDocument', /^LuxTrust cannot get documents: /, () => adapter.getDocument(CREDS, 'd_1')],
  [
    'listAuditTrailEntries',
    /^LuxTrust cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'doc_1', params()),
  ],
  [
    'getAuditTrailEntry',
    /^LuxTrust cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'doc_1:0'),
  ],
  [
    'listTemplates',
    /^LuxTrust cannot list templates: /,
    () => adapter.listTemplates(CREDS, params()),
  ],
  ['getTemplate', /^LuxTrust cannot get templates: /, () => adapter.getTemplate(CREDS, 'tpl_1')],
]

describe('LuxTrustAdapter refuses reads LuxTrust documents no API for', () => {
  for (const [name, message, call] of CASES) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const net = spyNetwork()
      await expect(call()).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(message),
      })
      expect(net.get).not.toHaveBeenCalled()
      expect(net.post).not.toHaveBeenCalled()
      expect(net.create).not.toHaveBeenCalled()
    })
  }

  it('quotes the vendor page in the refusal', async () => {
    await expect(adapter.listEnvelopes(CREDS, params())).rejects.toThrow(
      /fully accessible via a set of APIs or through a provided user interface/,
    )
  })
})
