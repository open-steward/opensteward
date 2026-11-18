/**
 * Zoho Bigin pipelines and activities, against the documented API.
 *
 * Pipelines: Bigin has no /settings/pipeline endpoint. Team Pipelines are the
 * layouts of the Pipelines module, read from
 * GET https://www.zohoapis.com/bigin/v2/settings/layouts?module={module_api_name}
 * (https://www.bigin.com/developer/docs/apis/v2/layouts-meta-data.html), whose
 * only parameter is `module`, with no paging. The fake honours only that path
 * and that parameter, with the documented `Zoho-oauthtoken` header.
 *
 * Activities: the documented Get Records modules are Contacts, Pipelines,
 * Accounts, Products, Tasks, Events and Calls
 * (https://www.bigin.com/developer/docs/apis/v2/get-records.html); there is no
 * Activities module, so the methods refuse before sending anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ZohoBiginAdapter } from '../../../../../../src/verticals/crm/adapters/zoho-bigin'
import { DEFAULT_BIGIN_SCOPES } from '../../../../../../src/verticals/crm/adapters/zoho-bigin/constants'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import sample from './fixtures/layouts-pipelines.json'

const CREDS: Credentials = { accessToken: 'tok-123', refreshToken: 'ref-123' }
const LAYOUT_IDS = ['2034020000000095023', '2034020000000464021', '2034020000000549001']

interface Seen {
  method: string
  url: URL
  headers: Record<string, string>
}

let seen: Seen[] = []
let status = 200

function json(body: unknown, code = 200): Response {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  seen = []
  status = 200
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const headers = init.headers as Record<string, string>
      seen.push({ method: init.method ?? 'GET', url, headers })
      if (headers['Authorization'] !== 'Zoho-oauthtoken tok-123')
        return json({ code: 'INVALID_TOKEN' }, 401)
      if (url.origin + url.pathname !== 'https://www.zohoapis.com/bigin/v2/settings/layouts')
        return json({ code: 'INVALID_URL_PATTERN' }, 404)
      const keys = [...url.searchParams.keys()]
      if (keys.length !== 1 || url.searchParams.get('module') !== 'Pipelines')
        return json({ code: 'REQUIRED_PARAM_MISSING' }, 400)
      if (status === 204) return new Response(null, { status: 204 })
      if (status !== 200) return json({ code: 'INTERNAL_ERROR' }, status)
      return json(sample)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new ZohoBiginAdapter()

function paramsFor(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit } as QueryParams)
}

describe('zoho-bigin listPipelines', () => {
  it('reads the layouts of the Pipelines module, and nothing else', async () => {
    const rows = await adapter.listPipelines(CREDS, paramsFor(1, 100))
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe('GET')
    expect(seen[0]!.url.toString()).toBe(
      'https://www.zohoapis.com/bigin/v2/settings/layouts?module=Pipelines',
    )
    expect(rows.map((p) => PipelineSchema.parse(p).id)).toEqual(LAYOUT_IDS)
    expect(rows[0]!.name).toBe('Sales - Marketing')
    expect(rows[0]!.stages).toHaveLength(9)
  })

  it('walks 2L+1 layouts at L=1: every id once, hasMore exact', async () => {
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const params = paramsFor(page, 1)
      const rows = await adapter.listPipelines(CREDS, params)
      got.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore)
      expect(meta?.pagedLocally).toBe(true)
      expect(meta?.totalCount).toBe(3)
    }
    expect(got).toEqual(LAYOUT_IDS)
    expect(more).toEqual([true, true, false, false])
  })

  it('serves no layouts when Bigin answers 204 No Content', async () => {
    status = 204
    const params = paramsFor(1, 10)
    expect(await adapter.listPipelines(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('surfaces an upstream error instead of reporting an empty list', async () => {
    status = 500
    await expect(adapter.listPipelines(CREDS, paramsFor(1, 10))).rejects.toMatchObject({
      statusCode: 500,
    })
  })

  it('honours credentials.extra.apiBaseUrl for another data centre', async () => {
    const creds = { ...CREDS, extra: { apiBaseUrl: 'https://www.zohoapis.eu/bigin/v2' } }
    await adapter.listPipelines(creds, paramsFor(1, 10)).catch(() => undefined)
    expect(seen[0]!.url.toString()).toBe(
      'https://www.zohoapis.eu/bigin/v2/settings/layouts?module=Pipelines',
    )
  })
})

describe('zoho-bigin getPipeline', () => {
  it('reads one layout of the Pipelines module by its id', async () => {
    const p = PipelineSchema.parse(await adapter.getPipeline(CREDS, '2034020000000464021'))
    expect(p.id).toBe('2034020000000464021')
    expect(p.name).toBe('Operations')
    expect(seen.map((s) => s.url.toString())).toEqual([
      'https://www.zohoapis.com/bigin/v2/settings/layouts?module=Pipelines',
    ])
  })

  it('is a 404 for an id no layout has', async () => {
    await expect(adapter.getPipeline(CREDS, '999')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('zoho-bigin scopes', () => {
  it('asks for the layouts scope the Layouts Metadata API requires', () => {
    expect(DEFAULT_BIGIN_SCOPES).toContain('ZohoBigin.settings.layouts.READ')
    const url = new URL(new ZohoBiginAdapter({ clientId: 'c' }).getAuthUrl('s'))
    expect(url.searchParams.get('scope')?.split(',')).toContain('ZohoBigin.settings.layouts.READ')
  })
})

describe('zoho-bigin activities', () => {
  it('listActivities refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.listActivities(CREDS, paramsFor(1, 10))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('separate Tasks, Events and Calls modules'),
    })
    expect(seen).toHaveLength(0)
  })

  it('getActivity refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.getActivity(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(seen).toHaveLength(0)
  })
})
