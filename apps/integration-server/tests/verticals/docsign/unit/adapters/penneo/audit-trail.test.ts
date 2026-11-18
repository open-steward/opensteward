import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { PenneoClient } from '../../../../../../src/verticals/docsign/adapters/penneo/client'
import { PenneoAdapter } from '../../../../../../src/verticals/docsign/adapters/penneo'

/**
 * Penneo's API spec (https://app.penneo.com/api/docs/swagger.json) has no
 * `/casefiles/{caseFileId}/log` path. The nearest, `GET
 * /api/{version}/casefiles/{caseFileId}/history` ("Get the history of a case
 * file."), documents no response body at all: its only response is `400`
 * "Returned when the case file could not be deleted". The signer event log
 * (`SignerLogEntry`) documents only `eventType`, `identitySignerName` and
 * `identityType`: no id and no timestamp, and the canonical `occurredAt` is
 * required. So audit-trail entries are refused before any request is sent.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const adapter = new PenneoAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

function spyAll() {
  return [
    vi.spyOn(PenneoClient.prototype, 'get').mockResolvedValue([] as never),
    vi.spyOn(PenneoClient.prototype, 'post').mockResolvedValue({} as never),
  ]
}

describe('PenneoAdapter audit trail is refused', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const spies = spyAll()
    await expect(
      adapter.listAuditTrailEntries(CREDS, '42', withPageSink({ page: 1, limit: 2 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Penneo cannot list audit trail entries: /),
    })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const spies = spyAll()
    await expect(adapter.getAuditTrailEntry(CREDS, '42:0')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Penneo cannot read audit trail entries: /),
    })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('does not swallow the refusal into an empty list', async () => {
    spyAll()
    await expect(adapter.listAuditTrailEntries(CREDS, '42', {})).rejects.toThrow()
  })
})
