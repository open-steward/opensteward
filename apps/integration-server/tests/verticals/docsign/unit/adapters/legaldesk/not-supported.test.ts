/**
 * LegalDesk publishes no reference for a signer, document or audit-trail
 * read.
 *
 * The only first-party API material, https://legaldesk.com/what-are-esign-and-ekyc-api,
 * names no endpoint at all: under "How To Avail eSign API Or eKYC API?" it
 * says "The eSign API allows you to get your customers’ signature on
 * documents electronically using Aadhaar-based eSign service." and ends
 * "click the button below and submit your request. Get Your eSign API".
 * The `GET /v1/transactions/{id}` (embedded `signers[]` / `documents[]`) and
 * `GET /v1/transactions/{id}/audit-trail` paths the adapter called appear in
 * no LegalDesk document, and the audit method synthesised a trail from
 * undocumented timestamps on any error.
 *
 * Each method therefore refuses with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { LegaldeskClient } from '../../../../../../src/verticals/docsign/adapters/legaldesk/client'
import { LegaldeskAdapter } from '../../../../../../src/verticals/docsign/adapters/legaldesk'

const CREDS = {
  accessToken: 'ld_key',
  extra: { apiKey: 'ld_key', baseUrl: 'https://api.legaldesk.com' },
} as Credentials
const adapter = new LegaldeskAdapter()

afterEach(() => vi.restoreAllMocks())

// Stubbed, not call-through: a regression that sends a request fails here at
// once and offline instead of hanging on the real host.
function spyNetwork() {
  return {
    get: vi.spyOn(LegaldeskClient.prototype, 'get').mockRejectedValue(new Error('network')),
    post: vi.spyOn(LegaldeskClient.prototype, 'post').mockRejectedValue(new Error('network')),
    create: vi.spyOn(axios, 'create').mockImplementation(() => {
      throw new Error('network access in a refusal test')
    }),
  }
}

const params = () => withPageSink({ page: 2, limit: 2 })

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listSigners',
    /^LegalDesk cannot list signers: /,
    () => adapter.listSigners(CREDS, 'txn_1', params()),
  ],
  ['getSigner', /^LegalDesk cannot get signers: /, () => adapter.getSigner(CREDS, 'txn_1:0')],
  [
    'listDocuments',
    /^LegalDesk cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'txn_1', params()),
  ],
  ['getDocument', /^LegalDesk cannot get documents: /, () => adapter.getDocument(CREDS, 'txn_1:0')],
  [
    'listAuditTrailEntries',
    /^LegalDesk cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'txn_1', params()),
  ],
  [
    'getAuditTrailEntry',
    /^LegalDesk cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'txn_1:0'),
  ],
]

describe('LegaldeskAdapter refuses reads LegalDesk does not document', () => {
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

  it('the refusal quotes the first-party page it rests on', async () => {
    spyNetwork()
    await expect(adapter.listSigners(CREDS, 'txn_1', params())).rejects.toThrow(
      /what-are-esign-and-ekyc-api/,
    )
  })
})
