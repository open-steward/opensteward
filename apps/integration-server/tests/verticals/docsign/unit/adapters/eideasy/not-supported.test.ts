/**
 * eID Easy's API has no call that lists, or reads back with the connection's
 * API key, a transaction, its signers, its documents, an audit trail or a
 * template.
 *
 * The first-party Postman collection at
 * https://documenter.getpostman.com/view/3869493/Szf6WoG1 (linked from
 * https://docs.eideasy.com) holds 32 requests. None of them is
 * `/api/transactions`, `/api/transactions/{id}`, `/api/transactions/{id}/audit`
 * or `/api/templates`, the paths the adapter used, and no bundle of
 * docs.eideasy.com names them either. The only GET that returns signers is
 * `GET /api/signatures/signing-queues/{id}`, and https://docs.eideasy.com/multisigning/
 * says "In this case, authorization is performed via Authorization: Bearer
 * {signing_queue_secret}" — a secret minted per queue, not the account key this
 * connection holds. The only audit call is `POST /api/signatures/download-audit-trail`,
 * which returns a single `audit_trail_file` PDF.
 *
 * Each read method therefore refuses with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { EidEasyClient } from '../../../../../../src/verticals/docsign/adapters/eideasy/client'
import { EidEasyAdapter } from '../../../../../../src/verticals/docsign/adapters/eideasy'

const CREDS = { accessToken: 'eid_key', extra: {} } as Credentials
const adapter = new EidEasyAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    get: vi.spyOn(EidEasyClient.prototype, 'get'),
    post: vi.spyOn(EidEasyClient.prototype, 'post'),
    create: vi.spyOn(axios, 'create'),
  }
}

const params = () => withPageSink({ page: 2, limit: 2 })

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listEnvelopes',
    /^eID Easy cannot list envelopes: /,
    () => adapter.listEnvelopes(CREDS, params()),
  ],
  ['getEnvelope', /^eID Easy cannot get envelopes: /, () => adapter.getEnvelope(CREDS, 'q_1')],
  [
    'listSigners',
    /^eID Easy cannot list signers: /,
    () => adapter.listSigners(CREDS, 'q_1', params()),
  ],
  ['getSigner', /^eID Easy cannot get signers: /, () => adapter.getSigner(CREDS, 's_1')],
  [
    'listDocuments',
    /^eID Easy cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'q_1', params()),
  ],
  ['getDocument', /^eID Easy cannot get documents: /, () => adapter.getDocument(CREDS, 'd_1')],
  [
    'listAuditTrailEntries',
    /^eID Easy cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'q_1', params()),
  ],
  [
    'getAuditTrailEntry',
    /^eID Easy cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'q_1:0'),
  ],
  [
    'listTemplates',
    /^eID Easy cannot list templates: /,
    () => adapter.listTemplates(CREDS, params()),
  ],
  ['getTemplate', /^eID Easy cannot get templates: /, () => adapter.getTemplate(CREDS, 't_1')],
]

describe('EidEasyAdapter refuses resources the eID Easy API cannot read', () => {
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
