/**
 * CloudSign's Web API has no way to list or read an audit trail.
 *
 * The spec (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0)
 * has no `history`, `log` or `audit` path: under `/documents/{documentID}`
 * it documents only `alert`, `attribute`, `certificate`, `decline`, `files`,
 * `participants`, `participant_groups`, `reportees` and `attachments`. The
 * one record of a signing, `GET /documents/{documentID}/certificate`, is a
 * PDF: "リクエストが成功した場合、このエンドポイントは PDF ファイルを返却します。"
 * The adapter used to call a `GET /documents/{documentID}/history` that the
 * spec does not have, and swallowed the resulting error into an empty list.
 *
 * Both methods therefore refuse with 501 before any request is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { CloudSignClient } from '../../../../../../src/verticals/docsign/adapters/cloudsign/client'
import { CloudSignAdapter } from '../../../../../../src/verticals/docsign/adapters/cloudsign'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new CloudSignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

function spyNetwork() {
  return {
    get: vi.spyOn(CloudSignClient.prototype, 'get'),
    post: vi.spyOn(CloudSignClient.prototype, 'post'),
    put: vi.spyOn(CloudSignClient.prototype, 'put'),
    create: vi.spyOn(axios, 'create'),
  }
}

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listAuditTrailEntries',
    /^CloudSign cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'doc_1', withPageSink({ page: 2, limit: 2 })),
  ],
  [
    'getAuditTrailEntry',
    /^CloudSign cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'doc_1:0'),
  ],
]

describe.each(CASES)('CloudSignAdapter.%s', (_name, message, call) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const net = spyNetwork()
    await expect(call()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(message),
    })
    expect(net.get).not.toHaveBeenCalled()
    expect(net.post).not.toHaveBeenCalled()
    expect(net.put).not.toHaveBeenCalled()
    expect(net.create).not.toHaveBeenCalled()
  })
})
