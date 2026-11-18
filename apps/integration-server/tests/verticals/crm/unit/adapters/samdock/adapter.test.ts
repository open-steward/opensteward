import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { SamdockAdapter } from '../../../../../../src/verticals/crm/adapters/samdock/index'

/**
 * Samdock's first-party OpenAPI (https://samdock.readme.io/llms.txt):
 *  - servers: "https://samdock.app/" (Production), "https://stage.samdock.app/" (Sandbox)
 *  - security: http bearer, bearerFormat JWT
 *  - GET /api/contacts/Persons, GET /api/contacts/Organizations, GET /api/deals:
 *    `"parameters": []`, 200 is a bare array of the resource
 *  - GET /api/contacts/persons/{id}, /api/contacts/organizations/{id}, /api/deals/{id}
 */

const creds = { accessToken: 'jwt-token' }
let requests: { url: URL; init: RequestInit | undefined }[] = []

const COLLECTIONS: Record<string, (i: number) => Record<string, unknown>> = {
  '/api/contacts/Persons': (i) => ({
    _tenantID: 't',
    _id: `p${i}`,
    lastName: `Doe ${i}`,
    gender: 'Male',
    namePrefix: '',
    nameSuffix: '',
  }),
  '/api/contacts/Organizations': (i) => ({ _tenantID: 't', _id: `o${i}`, name: `Org ${i}` }),
  '/api/deals': (i) => ({ _tenantID: 't', _id: `d${i}`, name: `Deal ${i}`, organization: {} }),
}

/** Fake Samdock honouring only what the docs describe: no query params, whole array, bearer auth. */
function serve(n: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push({ url, init })
      if (url.origin !== 'https://samdock.app') return new Response('no such host', { status: 599 })
      const auth = new Headers(init?.headers).get('authorization')
      if (auth !== 'Bearer jwt-token') return new Response('Unauthorized error', { status: 401 })
      if (url.search !== '') return new Response('undocumented query', { status: 400 })
      const make = COLLECTIONS[url.pathname]
      if (make) {
        return Response.json(Array.from({ length: n }, (_, i) => make(i + 1)))
      }
      const one = url.pathname.match(
        /^\/api\/(contacts\/persons|contacts\/organizations|deals)\/([^/]+)$/,
      )
      if (one) {
        const key = {
          'contacts/persons': '/api/contacts/Persons',
          'contacts/organizations': '/api/contacts/Organizations',
          deals: '/api/deals',
        }[one[1]!]!
        const row = COLLECTIONS[key]!(1)
        return Response.json({ ...row, _id: decodeURIComponent(one[2]!) })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const LISTS = [
  ['listContacts', '/api/contacts/Persons', 'p'],
  ['listCompanies', '/api/contacts/Organizations', 'o'],
  ['listDeals', '/api/deals', 'd'],
] as const

describe.each(LISTS)('samdock %s', (method, path, prefix) => {
  it('walks 2L+1 rows across pages 1..3, each once, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const adapter = new SamdockAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter[method](creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `${prefix}${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it(`sends one bearer GET to https://samdock.app${path} with no query`, async () => {
    serve(4)
    await new SamdockAdapter()[method](creds, withPageSink({ page: 2, limit: 2 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url.toString()).toBe(`https://samdock.app${path}`)
    expect(new Headers(requests[0]!.init?.headers).get('authorization')).toBe('Bearer jwt-token')
    expect(new Headers(requests[0]!.init?.headers).has('x-api-key')).toBe(false)
  })

  it('reads a 200 that is not the documented bare array as no rows, the last page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'not an array' })),
    )
    const params = withPageSink({ page: 1, limit: 3 })
    await expect(new SamdockAdapter()[method](creds, params)).resolves.toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('samdock get methods', () => {
  it.each([
    ['getContact', '/api/contacts/persons/abc'],
    ['getCompany', '/api/contacts/organizations/abc'],
    ['getDeal', '/api/deals/abc'],
  ] as const)('%s reads %s', async (method, path) => {
    serve(1)
    const row = await new SamdockAdapter()[method](creds, 'abc')
    expect(row.id).toBe('abc')
    expect(requests.map((r) => r.url.toString())).toEqual([`https://samdock.app${path}`])
  })

  it.each([
    ['getContact', '/api/contacts/persons/'],
    ['getCompany', '/api/contacts/organizations/'],
    ['getDeal', '/api/deals/'],
  ] as const)('%s percent-encodes an id with reserved characters', async (method, prefix) => {
    serve(1)
    const row = await new SamdockAdapter()[method](creds, 'a/b?c#d')
    expect(row.id).toBe('a/b?c#d')
    expect(requests.map((r) => r.url.toString())).toEqual([
      `https://samdock.app${prefix}a%2Fb%3Fc%23d`,
    ])
  })
})

describe('samdock refused reads', () => {
  it.each([
    ['listPipelines', (a: SamdockAdapter) => a.listPipelines(creds, { page: 1, limit: 10 })],
    ['getPipeline', (a: SamdockAdapter) => a.getPipeline(creds, '1')],
    ['listNotes', (a: SamdockAdapter) => a.listNotes(creds, { page: 1, limit: 10 })],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    serve(3)
    await expect(call(new SamdockAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})
