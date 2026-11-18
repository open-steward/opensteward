import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { AutentiqueClient } from '../../../../../../src/verticals/docsign/adapters/autentique/client'
import { AutentiqueAdapter } from '../../../../../../src/verticals/docsign/adapters/autentique'

/**
 * Autentique documents no GraphQL query for signing templates. Its documented
 * queries are `me`, `documents`/`document`, `organizations`, `folders` and
 * `emailTemplates` (https://docs.autentique.com.br/api/llms.txt), and the
 * createDocument page says: "There is no way in the API to directly use the
 * panel templates to create documents."
 * (https://docs.autentique.com.br/api/mutations/criando-um-documento).
 *
 * `emailTemplates` lists notification e-mail layouts (text, sender, colors),
 * not signing templates, so it is not a source for the canonical Template.
 * Both template methods therefore refuse with 501 before any request.
 */

const CREDS = { accessToken: 'tok' } as Credentials

afterEach(() => vi.restoreAllMocks())

const adapter = new AutentiqueAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

// Verbatim from https://docs.autentique.com.br/api/mutations/criando-um-documento
const DOC_QUOTE =
  'There is no way in the API to directly use the panel templates to create documents.'

function spyNetwork() {
  const query = vi.spyOn(AutentiqueClient.prototype, 'query')
  const create = vi.spyOn(axios, 'create')
  return { query, create }
}

describe('AutentiqueAdapter templates are not listable', () => {
  it('listTemplates throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { query, create } = spyNetwork()
    await expect(
      adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: 2 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Autentique cannot list templates: /),
    })
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 2 }))).rejects.toThrow(
      DOC_QUOTE,
    )
    expect(query).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('getTemplate throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { query, create } = spyNetwork()
    await expect(adapter.getTemplate(CREDS, 'tmpl-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Autentique cannot get templates: /),
    })
    await expect(adapter.getTemplate(CREDS, 'tmpl-1')).rejects.toThrow(DOC_QUOTE)
    expect(query).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
