/**
 * Krayin CRM read requests: host, auth header and documented paths.
 *
 * Paths from krayin/rest-api's OpenAPI annotations (src/Docs/Controllers/**),
 * all mounted under `Route::prefix('api')` + `['prefix' => 'v1']`:
 *   path="/api/v1/contacts/persons/{id}", path="/api/v1/contacts/organizations/{id}",
 *   path="/api/v1/leads/{id}", path="/api/v1/settings/pipelines/{id}",
 *   path="/api/v1/activities/{id}". Each answers `@OA\Property(property="data", …)`.
 * Auth: l5-swagger `sanctum_admin`, "Enter token in format (Bearer <token>)".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { KrayinCrmAdapter } from '../../../../../../src/verticals/crm/adapters/krayin-crm/index'

const CREDS = { accessToken: 'tok', extra: { instanceUrl: 'https://crm.example.test/' } }

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeShow(record: Record<string, unknown>) {
  const sent: { url: URL; headers: Headers }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    sent.push({ url: new URL(String(input)), headers: new Headers(init?.headers) })
    return new Response(JSON.stringify({ data: record }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return sent
}

const GETS: {
  name: string
  path: string
  call: (a: KrayinCrmAdapter) => Promise<{ id: string }>
}[] = [
  { name: 'getContact', path: '/api/v1/contacts/persons/7', call: (a) => a.getContact(CREDS, '7') },
  {
    name: 'getCompany',
    path: '/api/v1/contacts/organizations/7',
    call: (a) => a.getCompany(CREDS, '7'),
  },
  { name: 'getDeal', path: '/api/v1/leads/7', call: (a) => a.getDeal(CREDS, '7') },
  {
    name: 'getPipeline',
    path: '/api/v1/settings/pipelines/7',
    call: (a) => a.getPipeline(CREDS, '7'),
  },
  { name: 'getActivity', path: '/api/v1/activities/7', call: (a) => a.getActivity(CREDS, '7') },
]

describe.each(GETS)('krayin-crm $name', ({ path, call }) => {
  it('GETs the documented path with the bearer token and reads `data`', async () => {
    const sent = fakeShow({ id: 7, name: 'n', title: 't' })
    const out = await call(new KrayinCrmAdapter())
    expect(out.id).toBe('7')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url.toString()).toBe(`https://crm.example.test${path}`)
    expect(sent[0]!.headers.get('authorization')).toBe('Bearer tok')
  })

  it('throws when the response has no `data` object', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 7 }), { status: 200 }),
    )
    await expect(call(new KrayinCrmAdapter())).rejects.toThrow(/no "data"/)
  })
})

describe('krayin-crm notes', () => {
  it('listNotes refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new KrayinCrmAdapter().listNotes(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getNote refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(new KrayinCrmAdapter().getNote(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
