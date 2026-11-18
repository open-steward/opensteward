/**
 * listSigners / getSigner / listDocuments / getDocument read DocHub's
 * documented GET /api/v2/sign-requests/{id} (operationId getSignRequest,
 * https://dev.dochub.com/api-reference/openapi.yaml), server
 * `https://{defaultHost}` with `defaultHost` default `dochub.com`.
 *
 * The fake below honours only what that operation documents: the `id` path
 * parameter and the `include` query parameter ("Supported values: `document`,
 * `user.entity`, `signers.user`, `signers.user.entity`"), bearer auth, and
 * `Accept: application/json` selecting the flat format in which related
 * resources are "embedded inline in the root object (`user`, `document`,
 * `signersData`)". With `include` omitted "only relationship identifiers are
 * returned", so the fake drops `document` / `signersData` unless asked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DochubAdapter } from '../../../../../../src/verticals/docsign/adapters/dochub'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import type { RawDochubFlatSignRequest } from '../../../../../../src/verticals/docsign/adapters/dochub/transform/sign-request'
import { SIGN_REQUEST, SIGNER_PENDING } from './fixtures'

const CREDS = { accessToken: 'tok_abc', extra: {} } as Credentials
const adapter = new DochubAdapter({
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://x/cb',
})

const DOCUMENTED_INCLUDES = new Set([
  'document',
  'user.entity',
  'signers.user',
  'signers.user.entity',
])

interface Call {
  baseURL: string | undefined
  headers: Record<string, unknown>
  path: string
  params: Record<string, unknown> | undefined
}

function fakeDochub(requests: Record<string, RawDochubFlatSignRequest>) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, unknown>
  }) => ({
    get: async (path: string, opts?: { params?: Record<string, unknown> }) => {
      calls.push({ baseURL: cfg.baseURL, headers: cfg.headers ?? {}, path, params: opts?.params })
      expect(cfg.baseURL).toBe('https://dochub.com/api/v2')
      expect(cfg.headers?.Authorization).toBe('Bearer tok_abc')
      expect(cfg.headers?.Accept).toBe('application/json')
      const m = /^\/sign-requests\/([^/?]+)$/.exec(path)
      if (!m)
        throw Object.assign(new Error(`undocumented path ${path}`), { response: { status: 404 } })
      for (const k of Object.keys(opts?.params ?? {})) {
        if (k !== 'include') throw new Error(`undocumented query parameter ${k}`)
      }
      const include = String(opts?.params?.include ?? '')
        .split(',')
        .filter((s) => s.length > 0)
      for (const inc of include) expect(DOCUMENTED_INCLUDES.has(inc)).toBe(true)
      const sr = requests[decodeURIComponent(m[1]!)]
      if (!sr) throw Object.assign(new Error('not found'), { response: { status: 404 } })
      const { document, signersData, ...bare } = sr
      return {
        data: {
          ...bare,
          ...(include.includes('document') ? { document } : {}),
          ...(include.some((i) => i.startsWith('signers.')) ? { signersData } : {}),
        },
      }
    },
    post: async () => {
      throw new Error('no writes expected')
    },
  })) as unknown as typeof axios.create)
  return calls
}

afterEach(() => vi.restoreAllMocks())

function signerN(i: number) {
  return { ...SIGNER_PENDING, id: `signer_${i}`, email: `s${i}@example.com`, name: `S ${i}` }
}

describe('DocHub listSigners', () => {
  it('reads signersData from GET /sign-requests/{id}?include=signers.user', async () => {
    const calls = fakeDochub({ sr123abc: SIGN_REQUEST })
    const out = await adapter.listSigners(CREDS, 'sr123abc', withPageSink({ page: 1, limit: 25 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/sign-requests/sr123abc')
    expect(calls[0]!.params).toEqual({ include: 'signers.user' })
    expect(out.map((s) => SignerSchema.parse(s).id)).toEqual(['sr123abc:signer789ghi'])
  })

  it('walks N = 2L+1 signers page by page, every id once, hasMore exact', async () => {
    const L = 2
    const N = 2 * L + 1
    const signersData = Array.from({ length: N }, (_, i) => signerN(i))
    fakeDochub({ sr_walk: { ...SIGN_REQUEST, id: 'sr_walk', signersData } })
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, 'sr_walk', params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.externalId))
      const meta = readUpstreamPage(params)
      hasMore.push(meta?.hasMore === true)
      expect(meta?.totalCount).toBe(N)
    }
    expect(seen).toEqual(signersData.map((s) => s.id))
    expect(new Set(seen).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
  })

  it('throws when the upstream omits signersData rather than returning an empty list', async () => {
    fakeDochub({ sr_x: { ...SIGN_REQUEST, id: 'sr_x', signersData: undefined } })
    await expect(
      adapter.listSigners(CREDS, 'sr_x', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/signersData/)
  })
})

describe('DocHub getSigner', () => {
  it('reads back a listed signer by its composite id', async () => {
    const calls = fakeDochub({ sr123abc: SIGN_REQUEST })
    const s = SignerSchema.parse(await adapter.getSigner(CREDS, 'sr123abc:signer789ghi'))
    expect(s.externalId).toBe('signer789ghi')
    expect(s.envelopeId).toBe('sr123abc')
    expect(calls[0]!.path).toBe('/sign-requests/sr123abc')
    expect(calls[0]!.params).toEqual({ include: 'signers.user' })
  })

  it('404s a signer the sign request does not carry', async () => {
    fakeDochub({ sr123abc: SIGN_REQUEST })
    await expect(adapter.getSigner(CREDS, 'sr123abc:nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('404s an id that is not <signRequestId>:<signerId> without sending a request', async () => {
    const calls = fakeDochub({ sr123abc: SIGN_REQUEST })
    await expect(adapter.getSigner(CREDS, 'signer789ghi')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls).toHaveLength(0)
  })
})

describe('DocHub listDocuments', () => {
  it('reads the embedded document from GET /sign-requests/{id}?include=document', async () => {
    const calls = fakeDochub({ sr123abc: SIGN_REQUEST })
    const params = withPageSink({ page: 1, limit: 1 })
    const out = await adapter.listDocuments(CREDS, 'sr123abc', params)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/sign-requests/sr123abc')
    expect(calls[0]!.params).toEqual({ include: 'document' })
    expect(out.map((d) => DocumentSchema.parse(d).id)).toEqual(['sr123abc:doc123abc'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 1, hasMore: false })
  })

  it('page 2 of the one document is empty and not hasMore', async () => {
    fakeDochub({ sr123abc: SIGN_REQUEST })
    const params = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, 'sr123abc', params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 1, hasMore: false })
  })

  it('throws when the upstream omits the document rather than returning an empty list', async () => {
    fakeDochub({ sr_x: { ...SIGN_REQUEST, id: 'sr_x', document: undefined } })
    await expect(
      adapter.listDocuments(CREDS, 'sr_x', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/document/)
  })
})

describe('DocHub getDocument', () => {
  it('reads back the listed document by its composite id', async () => {
    const calls = fakeDochub({ sr123abc: SIGN_REQUEST })
    const d = DocumentSchema.parse(await adapter.getDocument(CREDS, 'sr123abc:doc123abc'))
    expect(d.externalId).toBe('doc123abc')
    expect(calls[0]!.params).toEqual({ include: 'document' })
  })

  it('404s a document id that is not the sign request’s document', async () => {
    fakeDochub({ sr123abc: SIGN_REQUEST })
    await expect(adapter.getDocument(CREDS, 'sr123abc:other')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('404s a non-composite id without sending a request', async () => {
    const calls = fakeDochub({ sr123abc: SIGN_REQUEST })
    await expect(adapter.getDocument(CREDS, 'doc123abc')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(0)
  })
})
