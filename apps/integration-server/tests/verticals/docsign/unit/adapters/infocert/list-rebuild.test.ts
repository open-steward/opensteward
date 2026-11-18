/**
 * InfoCert reads, rebuilt onto the GoSign5 API.
 *
 * Source: the GoSign5 OpenAPI, https://devportal.infocert.digital/gosign/documentation/GoSign5
 * (raw `specs/GoSign5.yaml` from https://devportal.infocert.digital:8443/gosign/files).
 * Server `https://api.infocert.digital/gosign/v5`; its only paths are
 * `POST /dossiers`, `GET|DELETE /dossiers/{dossierExternalId}` and
 * `GET /dossiers/{dossierExternalId}/status`.
 *
 * - Signers and documents are read from the one dossier GET, which takes no
 *   paging parameters, so both are paged locally.
 * - Envelopes, templates and audit-trail entries have no GoSign5 path, so
 *   they refuse with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { InfoCertClient } from '../../../../../../src/verticals/docsign/adapters/infocert/client'
import { InfoCertAdapter } from '../../../../../../src/verticals/docsign/adapters/infocert'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import type {
  RawGoSign5Dossier,
  RawGoSign5Document,
  RawGoSign5Task,
} from '../../../../../../src/verticals/docsign/adapters/infocert/transform/envelope'
import { DOSSIER_EXAMPLE } from './dossier.fixture'

const CREDS = { accessToken: 'gosign-token' } as Credentials
const DOSSIER = DOSSIER_EXAMPLE.externalId!
const L = 2
const N = 2 * L + 1

afterEach(() => vi.restoreAllMocks())

const adapter = new InfoCertAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/**
 * A fake GoSign5 `GET /dossiers/{dossierExternalId}`. The operation documents
 * no query parameters, so any params at all are rejected.
 */
function fakeGetDossier(dossier: RawGoSign5Dossier) {
  return vi
    .spyOn(InfoCertClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (params !== undefined) throw new Error(`undocumented params ${JSON.stringify(params)}`)
      if (path !== `/dossiers/${encodeURIComponent(DOSSIER)}`)
        throw new Error(`undocumented path ${path}`)
      return dossier as never
    })
}

function dossierWithDocuments(total: number): RawGoSign5Dossier {
  const tmpl = DOSSIER_EXAMPLE.documents![0]!
  const documents: RawGoSign5Document[] = Array.from({ length: total }, (_, i) => ({
    ...tmpl,
    externalId: `doc-${i}`,
    originalFilename: `doc-${i}.pdf`,
  }))
  return { ...DOSSIER_EXAMPLE, documents }
}

function dossierWithActors(total: number): RawGoSign5Dossier {
  const tmpl = DOSSIER_EXAMPLE.process!.tasks![0]!
  const tasks: RawGoSign5Task[] = Array.from({ length: total }, (_, i) => ({
    ...tmpl,
    externalId: `tid-${i}`,
    actors: [{ userExternalId: `U${i}`, name: `User ${i}` }],
  }))
  return { ...DOSSIER_EXAMPLE, process: { tasks } }
}

async function walk<T extends { id: string }>(
  list: (params: Record<string, unknown>) => Promise<T[]>,
): Promise<{ seen: string[]; more: Array<boolean | undefined> }> {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit: L })
    const rows = await list(params)
    seen.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('InfoCertClient transport', () => {
  it('targets the documented GoSign5 server with a bearer token', () => {
    const create = vi.spyOn(axios, 'create')
    new InfoCertClient(CREDS)
    expect(create.mock.calls[0]![0]).toMatchObject({
      baseURL: 'https://api.infocert.digital/gosign/v5',
      headers: { Authorization: 'Bearer gosign-token' },
    })
  })
})

describe('InfoCertAdapter.getEnvelope → GET /dossiers/{dossierExternalId}', () => {
  it('reads the documented dossier path and parses it', async () => {
    const get = fakeGetDossier(DOSSIER_EXAMPLE)
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, DOSSIER))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(`/dossiers/${DOSSIER}`)
    expect(env.id).toBe(DOSSIER)
  })
})

describe('InfoCertAdapter dossier id encoding', () => {
  it('URL-encodes the dossierExternalId path segment', async () => {
    const get = vi
      .spyOn(InfoCertClient.prototype, 'get')
      .mockResolvedValue(DOSSIER_EXAMPLE as never)
    await adapter.getEnvelope(CREDS, 'a/b c')
    expect(get).toHaveBeenCalledWith('/dossiers/a%2Fb%20c')
  })
})

describe('InfoCertAdapter.exchangeCredentials', () => {
  it('rejects a missing access token', async () => {
    await expect(adapter.exchangeCredentials({})).rejects.toThrow(/apiKey/)
  })

  it('stores the access token', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: 't' })).resolves.toMatchObject({
      accessToken: 't',
    })
  })
})

describe('InfoCertAdapter.listDocuments → Dossier.documents', () => {
  it('reads the dossier once and parses documents[]', async () => {
    const get = fakeGetDossier(DOSSIER_EXAMPLE)
    const rows = await adapter.listDocuments(CREDS, DOSSIER, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(rows.map((r) => DocumentSchema.parse(r).id)).toEqual(['2wedtgw43aw4et', 'doc-annex-2'])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeGetDossier(dossierWithDocuments(N))
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, DOSSIER, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `doc-${i}`))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('keeps each document at its position in the whole dossier on later pages', async () => {
    fakeGetDossier(dossierWithDocuments(N))
    const rows = await adapter.listDocuments(CREDS, DOSSIER, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.order)).toEqual([2, 3])
  })
})

describe('InfoCertAdapter.listSigners → Dossier.process.tasks[].actors[]', () => {
  it('reads the dossier once and parses the task actors', async () => {
    const get = fakeGetDossier(DOSSIER_EXAMPLE)
    const rows = await adapter.listSigners(CREDS, DOSSIER, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(rows.map((r) => SignerSchema.parse(r).id)).toEqual([
      'tid1672671:XYZ4242',
      'tid1672672:ABC1111',
    ])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeGetDossier(dossierWithActors(N))
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, DOSSIER, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `tid-${i}:U${i}`))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })
})

describe('InfoCertAdapter refusals (no GoSign5 path)', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['listEnvelopes', () => adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))],
    ['listTemplates', () => adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))],
    ['getTemplate', () => adapter.getTemplate(CREDS, 'tmpl-1')],
    [
      'listAuditTrailEntries',
      () => adapter.listAuditTrailEntries(CREDS, DOSSIER, withPageSink({ page: 1, limit: L })),
    ],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, `${DOSSIER}:0`)],
    ['getSigner', () => adapter.getSigner(CREDS, 'tid1672671:XYZ4242')],
    ['getDocument', () => adapter.getDocument(CREDS, '2wedtgw43aw4et')],
  ]

  it.each(cases)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const get = vi.spyOn(InfoCertClient.prototype, 'get')
    const post = vi.spyOn(InfoCertClient.prototype, 'post')
    const create = vi.spyOn(axios, 'create')
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
