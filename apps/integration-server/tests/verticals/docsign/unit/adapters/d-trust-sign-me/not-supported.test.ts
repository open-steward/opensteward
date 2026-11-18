/**
 * D-Trust sign-me documents no API for reading envelopes, signers, documents,
 * audit trails or templates back.
 *
 * sign-me is a remote *signature* service. D-Trust's own API page
 * (https://www.d-trust.net/en/solutions/sign-me-api) compares its three
 * connection options, and for "API Direkt" answers "Workflows and templates"
 * with "Poss. yes (only if implemented in an integrated application or
 * specialised process)": the integrator's application owns the workflow, not
 * the sign-me API. No public API reference is published ("If you have any
 * questions about the connection process, please do not hesitate to contact
 * us."), and the `https://api.sign-me.de/v1` host the adapter called does not
 * resolve in DNS.
 *
 * Each read method therefore refuses with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DTrustSignMeClient } from '../../../../../../src/verticals/docsign/adapters/d-trust-sign-me/client'
import { DTrustSignMeAdapter } from '../../../../../../src/verticals/docsign/adapters/d-trust-sign-me'

const CREDS = { accessToken: 'tok', extra: {} } as Credentials
const adapter = new DTrustSignMeAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    get: vi.spyOn(DTrustSignMeClient.prototype, 'get'),
    post: vi.spyOn(DTrustSignMeClient.prototype, 'post'),
    create: vi.spyOn(axios, 'create'),
    axiosGet: vi.spyOn(axios, 'get'),
  }
}

const params = () => withPageSink({ page: 2, limit: 2 })

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listEnvelopes',
    /^D-Trust sign-me cannot list envelopes: /,
    () => adapter.listEnvelopes(CREDS, params()),
  ],
  [
    'getEnvelope',
    /^D-Trust sign-me cannot get envelopes: /,
    () => adapter.getEnvelope(CREDS, 'doc_1'),
  ],
  [
    'listSigners',
    /^D-Trust sign-me cannot list signers: /,
    () => adapter.listSigners(CREDS, 'doc_1', params()),
  ],
  ['getSigner', /^D-Trust sign-me cannot get signers: /, () => adapter.getSigner(CREDS, 's_1')],
  [
    'listDocuments',
    /^D-Trust sign-me cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'doc_1', params()),
  ],
  [
    'getDocument',
    /^D-Trust sign-me cannot get documents: /,
    () => adapter.getDocument(CREDS, 'd_1'),
  ],
  [
    'listAuditTrailEntries',
    /^D-Trust sign-me cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'doc_1', params()),
  ],
  [
    'getAuditTrailEntry',
    /^D-Trust sign-me cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'doc_1:0'),
  ],
  [
    'listTemplates',
    /^D-Trust sign-me cannot list templates: /,
    () => adapter.listTemplates(CREDS, params()),
  ],
  [
    'getTemplate',
    /^D-Trust sign-me cannot get templates: /,
    () => adapter.getTemplate(CREDS, 'tpl_1'),
  ],
]

describe('DTrustSignMeAdapter refuses resources the sign-me API does not document', () => {
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
      expect(net.axiosGet).not.toHaveBeenCalled()
    })
  }

  it('quotes the first-party reason in the refusal', async () => {
    await expect(adapter.listEnvelopes(CREDS, params())).rejects.toThrow(
      /only if implemented in an integrated application or specialised process/,
    )
  })
})
