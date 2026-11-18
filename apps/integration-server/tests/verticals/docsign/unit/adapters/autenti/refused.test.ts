/**
 * Autenti's Document Process API documents no template operation and no
 * lookup of one event by id (operations are under /document-processes,
 * /applications/callbacks, /clients and /tags:
 * https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/table-of-contents), so
 * these methods refuse with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { AutentiClient } from '../../../../../../src/verticals/docsign/adapters/autenti/client'
import { AutentiAdapter } from '../../../../../../src/verticals/docsign/adapters/autenti'

const CREDS = { accessToken: 'tok' } as Credentials
const adapter = new AutentiAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

describe('Autenti refuses what its API does not document', () => {
  it.each([
    ['listTemplates', () => adapter.listTemplates(CREDS, { page: 1, limit: 10 })],
    ['getTemplate', () => adapter.getTemplate(CREDS, 'tmpl_1')],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, 'EVENT-AUTENTI:x')],
  ])('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const get = vi.spyOn(AutentiClient.prototype, 'get')
    const post = vi.spyOn(AutentiClient.prototype, 'post')
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
