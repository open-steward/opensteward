/**
 * Visma Sign API v1 (https://sign.visma.net/api/docs/v1/) documents no audit,
 * event or history action, and "Get document status" returns only `uuid`,
 * `name`, `status`, `files` and `invitations` (each `uuid`, `status`,
 * `passphrase`, `email`, `sms`), with no timestamps. The adapter used to
 * synthesise entries from `sent_at`/`signed_at`/… fields the API does not
 * return, so it served an empty trail for every document.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { VismaSignClient } from '../../../../../../src/verticals/docsign/adapters/visma-sign/client'
import { VismaSignAdapter } from '../../../../../../src/verticals/docsign/adapters/visma-sign'

/** The documented example signing pair ("not real"). */
const CREDS: Credentials = {
  accessToken: 'jp7SjOOr4czRTifCo30qx0sZAIw9PW+vVpsbP09pQaY=',
  extra: { clientIdentifier: 'ddf58116-6082-4bfc-a775-0c0bb2f945ce' },
}
const adapter = new VismaSignAdapter({})

afterEach(() => vi.restoreAllMocks())

const CASES: Array<[string, RegExp, () => Promise<unknown>]> = [
  [
    'listAuditTrailEntries',
    /^Visma Sign cannot list audit trail entries: /,
    () => adapter.listAuditTrailEntries(CREDS, 'doc_1', withPageSink({ page: 2, limit: 2 })),
  ],
  [
    'getAuditTrailEntry',
    /^Visma Sign cannot get audit trail entries: /,
    () => adapter.getAuditTrailEntry(CREDS, 'doc_1:0'),
  ],
]

describe.each(CASES)('VismaSignAdapter.%s', (_name, message, call) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const get = vi.spyOn(VismaSignClient.prototype, 'get')
    const post = vi.spyOn(VismaSignClient.prototype, 'post')
    const create = vi.spyOn(axios, 'create')
    await expect(call()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(message),
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
