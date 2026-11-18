/**
 * Zammad listMessages paging.
 *
 * GET /api/v1/ticket_articles/by_ticket/{ticket id} is served by
 * TicketArticlesController#index_by_ticket
 * (https://github.com/zammad/zammad/blob/develop/app/controllers/ticket_articles_controller.rb),
 * which walks `ticket.articles.each` and ends with
 * `render json: articles, status: :ok` — it reads no page/per_page, so the
 * whole collection comes back in one response. The fake below ignores every
 * query parameter and always returns every article.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ZammadAdapter } from '../../../../../../src/verticals/customer-support/adapters/zammad/index'

const creds: Credentials = {
  accessToken: 'tok',
  extra: { baseUrl: 'https://support.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let articleCount = 0

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, config?: { params?: Record<string, unknown> }) => {
          calls.push({ path, params: { ...(config?.params ?? {}) } })
          // index_by_ticket: every article, whatever the query says.
          const data = Array.from({ length: articleCount }, (_, i) => ({
            id: i + 1,
            ticket_id: 7,
            sender: 'Agent',
            body: `b${i + 1}`,
            internal: false,
          }))
          return { data }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const adapter = new ZammadAdapter()
const run = (p: QueryParams) => adapter.listMessages(creds, '7', p)

describe('zammad listMessages paging', () => {
  it('serves every article once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    articleCount = 2 * L + 1
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await run(params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(listPage(rows, params, 'zammad').meta.hasMore ?? undefined)
    }
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 fetches the whole by_ticket list once, sending no page key', async () => {
    articleCount = 30
    await run(withPageSink({ page: 2, limit: 10 }))
    expect(calls.map((c) => c.path)).toEqual(['/ticket_articles/by_ticket/7'])
    expect(calls[0]!.params).toEqual({})
  })

  it('a limit above the maximum is clamped and serves the whole collection', async () => {
    articleCount = 260
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(260))
    expect(listPage(rows, params, 'zammad').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    articleCount = 41
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'zammad')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })
})
