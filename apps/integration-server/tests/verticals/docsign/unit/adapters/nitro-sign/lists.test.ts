/**
 * Nitro Sign signer / document reads, rebuilt onto the Nitro Sign Public API,
 * and the audit-trail refusal.
 *
 * Source: https://api.gonitro.dev/openapi.json, rendered at
 * https://developers.gonitro.com/docs/api-reference/sign/.
 *
 * - `GET /sign/envelopes/{envelopeID}/participants` "returns all participants
 *   associated with a specific envelope" and declares only the `envelopeID`
 *   path parameter, so it is paged locally.
 * - `GET /sign/envelopes/{envelopeID}/documents` "retrieves all documents
 *   associated with a specific envelope. Documents are returned in an `items`
 *   array", again with only the path parameter — paged locally.
 * - The only audit-trail operation is `GET
 *   /sign/envelopes/{envelopeID}:download-audit-trail`, which "Downloads the
 *   PDF file containing the full audit trail" — there are no JSON entries to
 *   list, so both audit-trail reads refuse with 501 before sending anything.
 * - `servers` lists three regional hosts (Europe / North America /
 *   Australia); the host comes from the connection, never a default.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { NitroSignClient } from '../../../../../../src/verticals/docsign/adapters/nitro-sign/client'
import { NitroSignAdapter } from '../../../../../../src/verticals/docsign/adapters/nitro-sign'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { PARTICIPANT_ACCESS_CODE, UPLOADED_DOCUMENT } from './fixtures'

const HOST = 'https://api.us.gonitro.dev'
const CREDS = { accessToken: 'jwt', extra: { signApiBaseUrl: HOST } } as Credentials
const ENV = '6e60b9f4-e7dd-4daf-af64-5ab274a8e1fd'
const L = 2
const N = 2 * L + 1

afterEach(() => vi.restoreAllMocks())

const adapter = new NitroSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

const participants = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...PARTICIPANT_ACCESS_CODE, ID: `participant-${i}` }))
const documents = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...UPLOADED_DOCUMENT, ID: `doc-${i}` }))

/**
 * A fake GET that serves only the two documented list paths for ENV and
 * rejects any query parameter — neither operation declares one.
 */
function fakeGet(total: number) {
  return vi
    .spyOn(NitroSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (params !== undefined && Object.keys(params).length > 0) {
        throw new Error(`undocumented query ${JSON.stringify(params)}`)
      }
      if (path === `/sign/envelopes/${ENV}/participants`) {
        return { items: participants(total), total } as never
      }
      if (path === `/sign/envelopes/${ENV}/documents`) {
        return { items: documents(total) } as never
      }
      throw new Error(`undocumented path ${path}`)
    })
}

async function walk<T extends { id: string }>(
  list: (p: ReturnType<typeof withPageSink>) => Promise<T[]>,
) {
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

describe('NitroSignAdapter.listSigners → GET /sign/envelopes/{envelopeID}/participants', () => {
  it('calls the documented path with no query and parses items[]', async () => {
    const get = fakeGet(2)
    const rows = await adapter.listSigners(CREDS, ENV, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(`/sign/envelopes/${ENV}/participants`)
    expect(get.mock.calls[0]![1]).toBeUndefined()
    expect(rows.map((r) => SignerSchema.parse(r).externalId)).toEqual([
      'participant-0',
      'participant-1',
    ])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeGet(N)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, ENV, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${ENV}:participant-${i}`))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('getSigner reads back an id that listSigners returned', async () => {
    fakeGet(N)
    const [, second] = await adapter.listSigners(CREDS, ENV, {})
    const got = await adapter.getSigner(CREDS, second!.id)
    expect(got.id).toBe(second!.id)
  })

  it('getSigner answers 404 for a participant the envelope does not list', async () => {
    fakeGet(N)
    await expect(adapter.getSigner(CREDS, `${ENV}:participant-99`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getSigner rejects an id that is not <envelopeId>:<participantId>', async () => {
    const get = fakeGet(1)
    await expect(adapter.getSigner(CREDS, 'participant-0')).rejects.toThrow(/envelopeId/)
    expect(get).not.toHaveBeenCalled()
  })

  it('throws on a response without the documented items array', async () => {
    vi.spyOn(NitroSignClient.prototype, 'get').mockResolvedValue({ data: [] } as never)
    await expect(adapter.listSigners(CREDS, ENV, {})).rejects.toThrow(/items/)
  })
})

describe('NitroSignAdapter.listDocuments → GET /sign/envelopes/{envelopeID}/documents', () => {
  it('calls the documented path with no query and parses items[] in order', async () => {
    const get = fakeGet(2)
    const rows = await adapter.listDocuments(CREDS, ENV, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(`/sign/envelopes/${ENV}/documents`)
    expect(get.mock.calls[0]![1]).toBeUndefined()
    const parsed = rows.map((r) => DocumentSchema.parse(r))
    expect(parsed.map((d) => [d.externalId, d.order])).toEqual([
      ['doc-0', 0],
      ['doc-1', 1],
    ])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeGet(N)
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, ENV, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${ENV}:doc-${i}`))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('keeps the envelope position as order on page 2', async () => {
    fakeGet(N)
    const rows = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(rows.map((d) => d.order)).toEqual([2, 3])
  })

  it('getDocument reads back an id that listDocuments returned, with its order', async () => {
    fakeGet(N)
    const [, second] = await adapter.listDocuments(CREDS, ENV, {})
    const got = await adapter.getDocument(CREDS, second!.id)
    expect(got.id).toBe(second!.id)
    expect(got.order).toBe(1)
  })

  it('getDocument answers 404 for a document the envelope does not list', async () => {
    fakeGet(N)
    await expect(adapter.getDocument(CREDS, `${ENV}:doc-99`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('NitroSignAdapter audit trail (PDF only) refuses', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const get = vi.spyOn(NitroSignClient.prototype, 'get')
    const create = vi.spyOn(axios, 'create')
    const err = await adapter
      .listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: L }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/cannot list audit trail entries/)
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const get = vi.spyOn(NitroSignClient.prototype, 'get')
    const create = vi.spyOn(axios, 'create')
    const err = await adapter.getAuditTrailEntry(CREDS, `${ENV}:0`).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('Nitro Sign Public API host', () => {
  function captureBaseUrl() {
    const instance = { get: vi.fn(async () => ({ data: { items: [] } })) }
    const create = vi.spyOn(axios, 'create').mockReturnValue(instance as never)
    return { create, instance }
  }

  it.each(['https://api.gonitro.dev', 'https://api.us.gonitro.dev', 'https://api.au.gonitro.dev'])(
    'uses the connection host %s, one of the documented servers',
    async (host) => {
      const { create, instance } = captureBaseUrl()
      await adapter.listSigners({ accessToken: 'jwt', extra: { signApiBaseUrl: host } }, ENV, {})
      expect(create.mock.calls[0]![0]).toMatchObject({
        baseURL: host,
        headers: { Authorization: 'Bearer jwt' },
      })
      expect(instance.get).toHaveBeenCalledWith(`/sign/envelopes/${ENV}/participants`, {
        params: undefined,
      })
    },
  )

  it.each([
    ['missing', {}],
    ['not a documented server', { signApiBaseUrl: 'https://api.nitro.com/sign/v1' }],
  ])('refuses before sending when the host is %s', async (_label, extra) => {
    const { create, instance } = captureBaseUrl()
    const err = await adapter
      .listDocuments({ accessToken: 'jwt', extra } as Credentials, ENV, {})
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 400, code: 'VALIDATION' })
    expect((err as Error).message).toMatch(/signApiBaseUrl/)
    expect(create).not.toHaveBeenCalled()
    expect(instance.get).not.toHaveBeenCalled()
  })

  it('accepts a documented host written with a trailing slash', async () => {
    const { create } = captureBaseUrl()
    await adapter.listSigners(
      { accessToken: 'jwt', extra: { signApiBaseUrl: 'https://api.gonitro.dev/' } },
      ENV,
      {},
    )
    expect(create.mock.calls[0]![0]).toMatchObject({ baseURL: 'https://api.gonitro.dev' })
  })

  it('encodes the envelope id into the path segment', async () => {
    const { instance } = captureBaseUrl()
    await adapter.listSigners(CREDS, 'a/b?c', {})
    expect(instance.get).toHaveBeenCalledWith('/sign/envelopes/a%2Fb%3Fc/participants', {
      params: undefined,
    })
  })
})
