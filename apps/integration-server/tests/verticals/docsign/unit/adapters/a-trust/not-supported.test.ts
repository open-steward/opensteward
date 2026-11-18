/**
 * A-Trust's Signaturbox API has no way to list or read back a signature
 * batch, its signers, its documents or an audit trail.
 *
 * The quick reference at https://docs.a-trust.at/apis/SignaturServer/overview
 * lists every call; the only GETs are `signaturebatches/<ticket>/certificate`
 * ("Get the used certificate"), `templates` and `templates/<id>`. Documents
 * are added by POST and fetched once by DELETE ("the signed documents can be
 * received with an HTTP DELETE call", batchSignature page), and "After all
 * documents of a signature Batch are successfully downloaded the session data
 * is deleted." The `/v1/dossiers` paths the adapter used appear nowhere in
 * https://docs.a-trust.at/swagger/signaturbox.yaml.
 *
 * Each method therefore refuses with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ATrustClient } from '../../../../../../src/verticals/docsign/adapters/a-trust/client'
import { ATrustAdapter } from '../../../../../../src/verticals/docsign/adapters/a-trust'

const CREDS = { accessToken: 'at_key', extra: {} } as Credentials
const adapter = new ATrustAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    get: vi.spyOn(ATrustClient.prototype, 'get'),
    post: vi.spyOn(ATrustClient.prototype, 'post'),
    create: vi.spyOn(axios, 'create'),
  }
}

const params = () => withPageSink({ page: 2, limit: 2 })

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listEnvelopes',
    /^A-Trust cannot list envelopes: /,
    () => adapter.listEnvelopes(CREDS, params()),
  ],
  ['getEnvelope', /^A-Trust cannot get envelopes: /, () => adapter.getEnvelope(CREDS, 'tkt_1')],
  [
    'listSigners',
    /^A-Trust cannot list signers: /,
    () => adapter.listSigners(CREDS, 'tkt_1', params()),
  ],
  ['getSigner', /^A-Trust cannot get signers: /, () => adapter.getSigner(CREDS, 's_1')],
  [
    'listDocuments',
    /^A-Trust cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'tkt_1', params()),
  ],
  ['getDocument', /^A-Trust cannot get documents: /, () => adapter.getDocument(CREDS, 'd_1')],
  [
    'listAuditTrailEntries',
    /^A-Trust cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'tkt_1', params()),
  ],
  [
    'getAuditTrailEntry',
    /^A-Trust cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'tkt_1:0'),
  ],
]

describe('ATrustAdapter refuses resources the Signaturbox API cannot read', () => {
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
})
