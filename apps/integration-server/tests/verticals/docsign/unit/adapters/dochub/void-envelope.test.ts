/**
 * voidEnvelope calls DocHub's documented POST /api/v2/sign-requests/{id}/void
 * (operationId voidSignRequest, https://dev.dochub.com/api-reference/openapi.yaml):
 * "Voids an in-progress sign request, cancelling it: status becomes `VOIDED`".
 * The operation documents only the `id` path parameter and no requestBody,
 * `security: - bearerAuth: []`, and a 200 whose `application/json` body is
 * `sign_request_flat_resource`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DochubAdapter } from '../../../../../../src/verticals/docsign/adapters/dochub'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SIGN_REQUEST } from './fixtures'

const CREDS = { accessToken: 'tok_abc', extra: {} } as Credentials
const adapter = new DochubAdapter({
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://x/cb',
})

interface Call {
  method: 'get' | 'post'
  baseURL: string | undefined
  path: string
  body: unknown
}

/** `failPostsWith`: HTTP statuses the next POSTs fail with, in order. */
function fakeDochub(failPostsWith: number[] = []) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, unknown>
  }) => ({
    get: async (path: string) => {
      calls.push({ method: 'get', baseURL: cfg.baseURL, path, body: undefined })
      throw Object.assign(new Error('no reads expected'), { response: { status: 404 } })
    },
    post: async (path: string, body: unknown) => {
      calls.push({ method: 'post', baseURL: cfg.baseURL, path, body })
      const fail = failPostsWith.shift()
      if (fail !== undefined) {
        throw Object.assign(new Error(`HTTP ${fail}`), { response: { status: fail } })
      }
      expect(cfg.headers?.Authorization).toBe('Bearer tok_abc')
      expect(cfg.headers?.Accept).toBe('application/json')
      const m = /^\/sign-requests\/([^/]+)\/void$/.exec(path)
      if (cfg.baseURL !== 'https://dochub.com/api/v2' || !m) {
        throw Object.assign(new Error(`undocumented ${cfg.baseURL}${path}`), {
          response: { status: 404 },
        })
      }
      const id = decodeURIComponent(m[1]!)
      const { document: _d, signersData: _s, ...bare } = SIGN_REQUEST
      return { data: { ...bare, id, status: 'VOIDED', updatedAt: '2024-01-21T08:00:00.000Z' } }
    },
  })) as unknown as typeof axios.create)
  return calls
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DocHub voidEnvelope', () => {
  it('POSTs /api/v2/sign-requests/{id}/void with no body and nothing else', async () => {
    const calls = fakeDochub()
    await adapter.voidEnvelope(CREDS, 'sr123abc', { reason: 'dup' })
    expect(calls).toEqual([
      {
        method: 'post',
        baseURL: 'https://dochub.com/api/v2',
        path: '/sign-requests/sr123abc/void',
        body: undefined,
      },
    ])
  })

  it('returns the voided envelope from the documented flat response', async () => {
    fakeDochub()
    const env = EnvelopeSchema.parse(await adapter.voidEnvelope(CREDS, 'sr123abc'))
    expect(env.id).toBe('sr123abc')
    expect(env.status).toBe('voided')
    expect(env.subject).toBe('ACTION NEEDED: Contract Agreement')
    expect(env.documentIds).toEqual(['sr123abc:doc123abc'])
    expect(env.signerIds).toEqual(['sr123abc:signer789ghi'])
  })

  it('encodes the id into the path', async () => {
    const calls = fakeDochub()
    await adapter.voidEnvelope(CREDS, 'a/b')
    expect(calls[0]!.path).toBe('/sign-requests/a%2Fb/void')
  })

  // voidSignRequest, "## Retries": "Void is a one-way transition and is **not
  // retry-idempotent**: once voided the sign request is no longer
  // `IN_PROGRESS`, so a repeated void returns `422`". A 5xx can follow a void
  // that committed, so re-POSTing would turn that success into a 422.
  it('does not re-POST a void after a 5xx', async () => {
    vi.useFakeTimers()
    const calls = fakeDochub([502])
    const settled = adapter.voidEnvelope(CREDS, 'sr123abc').then(
      () => 'resolved',
      (e: { response?: { status?: number } }) => e.response?.status,
    )
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await settled).toBe(502)
    expect(calls.filter((c) => c.method === 'post')).toHaveLength(1)
  })

  it('still retries a void refused with 429 (rate limit exceeded)', async () => {
    vi.useFakeTimers()
    const calls = fakeDochub([429])
    const settled = adapter.voidEnvelope(CREDS, 'sr123abc')
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await settled).status).toBe('voided')
    expect(calls.filter((c) => c.method === 'post')).toHaveLength(2)
  })
})
