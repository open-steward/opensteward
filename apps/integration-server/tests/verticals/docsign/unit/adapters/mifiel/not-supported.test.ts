/**
 * Mifiel refuses, before any request, what its API does not expose.
 *
 * The API reference (https://docs.mifiel.com/en/api.json) documents these
 * paths and no others: /api/v1/documents (post), /api/v1/documents/{id}/state
 * (get), /api/v1/documents/{id} (delete), /api/v1/documents/{document_id}/stakeholders
 * (post), /api/v1/documents/{document_id}/stakeholders/{id} (put, delete),
 * /api/v1/documents/{id}/file_signed, /zip, /xml (get), /api/v1/webhooks
 * (get, post), /api/v1/webhooks/{id}/trigger (post), /api/v1/webhooks/{id}
 * (delete) and /api/query (post).
 *
 *   - audit trail: no audit, history or event endpoint.
 *   - templates: /api/query lists "Plantillas de documentos (template)" but no
 *     template attribute is documented anywhere, and without `fields` "la
 *     respuesta podría aparecer “vacía”"
 *     (https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api).
 *   - a stakeholder by id: /stakeholders/{id} takes only PUT and DELETE.
 */
import axios from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { MifielAdapter } from '../../../../../../src/verticals/docsign/adapters/mifiel'

const CREDS: Credentials = { accessToken: 'app-secret-1', extra: { appId: 'app-id-1' } }
const adapter = new MifielAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

const refusals: Array<[string, () => Promise<unknown>, RegExp]> = [
  [
    'listAuditTrailEntries',
    () => adapter.listAuditTrailEntries(CREDS, 'doc-1', withPageSink({ page: 1, limit: 2 })),
    /cannot list audit trail entries/,
  ],
  [
    'getAuditTrailEntry',
    () => adapter.getAuditTrailEntry(CREDS, 'doc-1:0'),
    /cannot read audit trail entries/,
  ],
  [
    'listTemplates',
    () => adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 2 })),
    /cannot list templates/,
  ],
  ['getTemplate', () => adapter.getTemplate(CREDS, 'tpl-1'), /cannot read templates/],
  ['getSigner', () => adapter.getSigner(CREDS, 'stk-1'), /cannot get a stakeholder by id/],
]

describe('MifielAdapter refusals', () => {
  it.each(refusals)('%s throws 501 NOT_SUPPORTED and sends no request', async (_n, call, msg) => {
    const spy = vi.spyOn(axios.Axios.prototype, 'request')
    await expect(call()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(msg),
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
