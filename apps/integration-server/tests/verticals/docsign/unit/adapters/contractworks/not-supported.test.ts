/**
 * ContractWorks (contractworks.com) documents no public API, and the API this
 * adapter was calling belongs to a different company.
 *
 * - ContractWorks' own site links no developer or API documentation:
 *   developer.contractworks.com and api.contractworks.com redirect to the
 *   marketing home page, and no /help page or the pricing page mentions an API.
 * - The adapter's docs URL, https://github.com/ContractingWorks/ClientAPI, is
 *   "Documentation and examples for using the Contracting.Works client API",
 *   a contracting/field-service system ("plumbers and electricians may use
 *   different terms for the same concepts", Doc/SystemArchitecture.md). Its
 *   GraphQL schema (Examples/ReadAndWrite/schema.graphql) has no signature,
 *   signer or envelope type at all, and the fields the adapter queried
 *   (Assignment.name/status/documents/history, Contact.signedAt,
 *   ServiceAgreement.id/name) do not exist in it.
 *
 * Every read therefore refuses with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ContractworksClient } from '../../../../../../src/verticals/docsign/adapters/contractworks/client'
import { ContractworksAdapter } from '../../../../../../src/verticals/docsign/adapters/contractworks'

const CREDS = { accessToken: 'tok', extra: { tenantId: 'b-dummydata' } } as Credentials
const adapter = new ContractworksAdapter()

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    // Stubbed, never called through: a regressing mutant must not reach the network.
    graphql: vi
      .spyOn(ContractworksClient.prototype, 'graphql')
      .mockRejectedValue(new Error('test: network blocked')),
    post: vi
      .spyOn(ContractworksClient.prototype, 'post')
      .mockRejectedValue(new Error('test: network blocked')),
    create: vi.spyOn(axios, 'create').mockImplementation(() => {
      throw new Error('test: network blocked')
    }),
  }
}

const params = () => withPageSink({ page: 2, limit: 2 })

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listEnvelopes',
    /^ContractWorks cannot list envelopes: /,
    () => adapter.listEnvelopes(CREDS, params()),
  ],
  ['getEnvelope', /^ContractWorks cannot get envelopes: /, () => adapter.getEnvelope(CREDS, 'a_1')],
  [
    'listSigners',
    /^ContractWorks cannot list signers: /,
    () => adapter.listSigners(CREDS, 'a_1', params()),
  ],
  ['getSigner', /^ContractWorks cannot get signers: /, () => adapter.getSigner(CREDS, 's_1')],
  [
    'listDocuments',
    /^ContractWorks cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'a_1', params()),
  ],
  ['getDocument', /^ContractWorks cannot get documents: /, () => adapter.getDocument(CREDS, 'd_1')],
  [
    'listAuditTrailEntries',
    /^ContractWorks cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'a_1', params()),
  ],
  [
    'getAuditTrailEntry',
    /^ContractWorks cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'a_1:0'),
  ],
  [
    'listTemplates',
    /^ContractWorks cannot list templates: /,
    () => adapter.listTemplates(CREDS, params()),
  ],
  ['getTemplate', /^ContractWorks cannot get templates: /, () => adapter.getTemplate(CREDS, 't_1')],
]

describe('ContractworksAdapter refuses reads it has no documented API for', () => {
  for (const [name, message, call] of CASES) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const net = spyNetwork()
      await expect(call()).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(message),
      })
      expect(net.graphql).not.toHaveBeenCalled()
      expect(net.post).not.toHaveBeenCalled()
      expect(net.create).not.toHaveBeenCalled()
    })
  }
})
