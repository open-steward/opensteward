import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { D4SignClient } from '../../../../../../src/verticals/docsign/adapters/d4sign/client'
import { D4SignAdapter } from '../../../../../../src/verticals/docsign/adapters/d4sign'

/**
 * D4Sign documents no audit-trail / history endpoint. The adapter used to call
 * `GET /documents/{UUID}/historic`, which appears on none of the pages listed
 * in https://docapi.d4sign.com.br/llms.txt. None of the documented
 * `/documents/{uuid}/<sub>` paths (e.g. list, download, cancel, resend,
 * addpins, addhighlight, addinfo, scheduling, listslaves, signaturelink,
 * powerformresponses, sendtosigner, createlist, webhooks) is a history or
 * audit-trail endpoint. So both audit-trail methods refuse before sending
 * anything.
 */

const CREDS = { accessToken: 'tok', extra: { tokenAPI: 'tok', cryptKey: 'ck' } } as Credentials
const adapter = new D4SignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

function spyTransport() {
  const get = vi.spyOn(D4SignClient.prototype, 'get').mockResolvedValue([] as never)
  const post = vi.spyOn(D4SignClient.prototype, 'post').mockResolvedValue({} as never)
  return { get, post }
}

afterEach(() => vi.restoreAllMocks())

describe('D4SignAdapter audit trail is refused: no documented endpoint', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post } = spyTransport()
    await expect(
      adapter.listAuditTrailEntries(CREDS, 'doc-uuid-1', withPageSink({ page: 1, limit: 2 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^D4Sign cannot list audit trail entries: /),
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post } = spyTransport()
    await expect(adapter.getAuditTrailEntry(CREDS, 'doc-uuid-1:0')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^D4Sign cannot get audit trail entries: /),
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
