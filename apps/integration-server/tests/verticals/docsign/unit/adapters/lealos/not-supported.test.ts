/**
 * Lealos has no API that can be verified to exist.
 *
 * The adapter's own comments called its paths "best-guess defaults" inferred
 * "from REST conventions". Checked on 2026-09-24:
 *   - `api.lealos.com`, the adapter's base host and the metadata `docs_url`
 *     host, has no DNS record (`getaddrinfo ENOTFOUND api.lealos.com`).
 *   - `lealos.com` resolves but refuses or times out on 80 and 443.
 *   - The Wayback Machine's captures of `lealos.com` date from 2003 to 2005
 *     (a GoDaddy parking page, "lealos.com coming soon! This page is parked
 *     FREE at GoDaddy.com!", then a personal WebCalendar and photo gallery),
 *     plus a single 2014 request for /favicon.ico that returned 404. The
 *     rebuild's CDX query for `api.lealos.com` returned no captures.
 *
 * No first-party document describes a signer, document or audit-trail
 * endpoint. listSigners, listDocuments and listAuditTrailEntries, together
 * with their get* pairs, therefore refuse with 501 before building a client.
 * listAuditTrailEntries also used to make up a history from document
 * timestamps when its guessed path failed. That fallback is gone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import dns from 'node:dns'
import net from 'node:net'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { LealosClient } from '../../../../../../src/verticals/docsign/adapters/lealos/client'
import { LealosAdapter } from '../../../../../../src/verticals/docsign/adapters/lealos'

const CREDS = { accessToken: 'key' } as Credentials
const adapter = new LealosAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    get: vi.spyOn(LealosClient.prototype, 'get'),
    post: vi.spyOn(LealosClient.prototype, 'post'),
    create: vi.spyOn(axios, 'create'),
    // A request that bypasses LealosClient and axios must be caught too.
    fetch: vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch called')),
    lookup: vi.spyOn(dns, 'lookup'),
    connect: vi.spyOn(net.Socket.prototype, 'connect'),
  }
}

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listSigners',
    /^Lealos cannot list signers: /,
    () => adapter.listSigners(CREDS, 'doc_1', withPageSink({ page: 2, limit: 2 })),
  ],
  ['getSigner', /^Lealos cannot get signers: /, () => adapter.getSigner(CREDS, 's_1')],
  [
    'listDocuments',
    /^Lealos cannot list documents: /,
    () => adapter.listDocuments(CREDS, 'doc_1', withPageSink({ page: 2, limit: 2 })),
  ],
  ['getDocument', /^Lealos cannot get documents: /, () => adapter.getDocument(CREDS, 'doc_1')],
  [
    'listAuditTrailEntries',
    /^Lealos cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'doc_1', withPageSink({ page: 2, limit: 2 })),
  ],
  [
    'getAuditTrailEntry',
    /^Lealos cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'doc_1:0'),
  ],
]

describe.each(CASES)('LealosAdapter.%s', (_name, message, call) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const spies = spyNetwork()
    await expect(call()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(message),
    })
    for (const [name, spy] of Object.entries(spies)) {
      expect(spy, name).not.toHaveBeenCalled()
    }
  })
})
