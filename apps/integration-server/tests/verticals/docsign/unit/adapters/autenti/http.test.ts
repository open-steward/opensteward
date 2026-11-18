/**
 * The requests Autenti actually receives, seen through real axios with only
 * the transport replaced.
 *
 * Server: the OpenAPI `servers` entry {"url":"https://api.autenti.com/api/v2",
 * "description":"Production server"} (node 111e9353643f4). Representation:
 * "The selection depends on standard `Accept` header" — `application/json`
 * for the "Paginated response, with a JSON array as the top level object",
 * `application/stream+json` for the "Streaming response, using concatenated
 * JSON" ("Streaming vs JSON array queries", node aeea144bc9795).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios, { type CreateAxiosDefaults, type InternalAxiosRequestConfig } from 'axios'
import { withPageSink, _resetRowPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { AutentiAdapter } from '../../../../../../src/verticals/docsign/adapters/autenti'
import { parseConcatenatedJson } from '../../../../../../src/verticals/docsign/adapters/autenti/client'
import { documentProcessInProgress, filesResponse } from './fixtures'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new AutentiAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const ENV = 'DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42'

interface Seen {
  url: string
  accept: string | undefined
  authorization: string | undefined
}

/** Replace only axios's transport; `respond` gives the raw response body. */
function transport(respond: (config: InternalAxiosRequestConfig) => string) {
  const seen: Seen[] = []
  const realCreate = axios.create.bind(axios)
  vi.spyOn(axios, 'create').mockImplementation((cfg?: CreateAxiosDefaults) =>
    realCreate({
      ...cfg,
      adapter: async (config: InternalAxiosRequestConfig) => {
        seen.push({
          url: axios.getUri(config),
          accept: config.headers.get('Accept') as string | undefined,
          authorization: config.headers.get('Authorization') as string | undefined,
        })
        return { data: respond(config), status: 200, statusText: 'OK', headers: {}, config }
      },
    }),
  )
  return seen
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('Autenti HTTP requests', () => {
  it('lists document processes at the documented v2 server as a paginated JSON array', async () => {
    const seen = transport(() => JSON.stringify([documentProcessInProgress()]))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 2 }))
    expect(seen[0]).toEqual({
      url: 'https://api.autenti.com/api/v2/document-processes?status=DRAFT&offset=0&limit=2',
      accept: 'application/json',
      authorization: 'Bearer tok',
    })
  })

  it('reads one document process at the documented v2 server', async () => {
    const seen = transport(() => JSON.stringify(documentProcessInProgress()))
    await adapter.getEnvelope(CREDS, ENV)
    expect(seen[0]!.url).toBe(`https://api.autenti.com/api/v2/document-processes/${ENV}`)
    expect(seen[0]!.accept).toBe('application/json')
  })

  it('streams a sub-collection with Accept: application/stream+json and no query', async () => {
    // The documented streaming body: the records concatenated, whitespace between.
    const body = filesResponse()
      .map((f) => JSON.stringify(f, null, 4))
      .join('\n')
    const seen = transport(() => body)
    const rows = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 1, limit: 10 }))
    expect(seen[0]).toEqual({
      url: `https://api.autenti.com/api/v2/document-processes/${ENV}/files`,
      accept: 'application/stream+json',
      authorization: 'Bearer tok',
    })
    expect(rows.map((r) => r.id)).toEqual(filesResponse().map((f) => f.id))
  })
})

describe('parseConcatenatedJson', () => {
  it('reads records concatenated with whitespace, and with no separator at all', () => {
    expect(parseConcatenatedJson('{"id":"a"}\n{"id":"b"}{"id":"c"}', '/x')).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])
  })

  it('is not fooled by braces and escaped quotes inside strings', () => {
    expect(parseConcatenatedJson('{"a":"}{\\"","b":[{"c":1}]} {"d":null}', '/x')).toEqual([
      { a: '}{"', b: [{ c: 1 }] },
      { d: null },
    ])
  })

  it('reads an empty stream as no records', () => {
    expect(parseConcatenatedJson(' \n', '/x')).toEqual([])
  })

  it('refuses a JSON array, which is the paginated form and may be one page only', () => {
    expect(() => parseConcatenatedJson('[{"id":"a"}]', '/x')).toThrow(/not a JSON object/)
  })

  it('refuses a truncated record', () => {
    expect(() => parseConcatenatedJson('{"id":"a"} {"id":', '/x')).toThrow(/truncated/)
  })
})
