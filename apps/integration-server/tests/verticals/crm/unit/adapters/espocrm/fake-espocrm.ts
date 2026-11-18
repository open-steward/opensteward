/**
 * A fake EspoCRM instance that honours ONLY documented list parameters, and
 * refuses anything else rather than ignoring it.
 *
 *  - Root path: "The root API path is: api/v1/." and "X-Api-Key:
 *    API_KEY_COPIED_FROM_THE_USER_DETAIL_VIEW" (docs.espocrm.com/development/api/).
 *  - GET {entityType}: maxSize, offset, ... returning { "list": [...],
 *    "total": N } (docs.espocrm.com/development/api/crud/); maxSize
 *    {"minimum":0,"maximum":200}, offset {"minimum":0} (docs.espocrm.com/api/spec.json).
 *  - "It's also possible to pass all search parameters in JSON format in a
 *    single query parameter searchParams" (docs.espocrm.com/development/api-search-params/).
 *  - GET {entityType}/{id}/{link}: maxSize, offset, where, orderBy, order,
 *    select (docs.espocrm.com/development/api/relationships/).
 *  - total -1: "there are more records"; -2: "there are no more records".
 */
import { vi } from 'vitest'

export const HOST = 'https://crm.acme.test'
export const API_KEY = 'espo-key'
export const CREDS = { accessToken: API_KEY, extra: { instanceUrl: HOST } }
export const MAX = 200

export type TotalMode = 'count' | 'minus' | 'none'

export interface FakeEspo {
  sent: URL[]
  entities: Record<string, Record<string, unknown>[]>
  stages: Record<string, Record<string, unknown>[]>
}

const LIST_KEYS = new Set(['offset', 'maxSize'])
const LINK_KEYS = new Set(['offset', 'maxSize', 'orderBy', 'order'])
const SEARCH_KEYS = new Set(['offset', 'maxSize', 'where'])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sizeOk(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX
}

function offsetOk(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0
}

function totalOf(all: unknown[], offset: number, got: number, mode: TotalMode): number | undefined {
  if (mode === 'none') return undefined
  if (mode === 'count') return all.length
  return offset + got < all.length ? -1 : -2
}

function matches(row: Record<string, unknown>, where: unknown): boolean {
  if (!Array.isArray(where)) return true
  return where.every((w: { type?: string; attribute?: string; value?: unknown }) => {
    if (w.type !== 'equals' || typeof w.attribute !== 'string') {
      throw new Error(`fake: unsupported where item ${JSON.stringify(w)}`)
    }
    return row[w.attribute] === w.value
  })
}

export function fakeEspo(
  seed: Partial<Pick<FakeEspo, 'entities' | 'stages'>>,
  opts: { total?: TotalMode; status?: number } = {},
): FakeEspo {
  const state: FakeEspo = {
    sent: [],
    entities: seed.entities ?? {},
    stages: seed.stages ?? {},
  }
  const mode = opts.total ?? 'count'
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    state.sent.push(url)
    if (opts.status) return new Response('upstream says no', { status: opts.status })
    const headers = new Headers(init?.headers)
    if (headers.get('X-Api-Key') !== API_KEY) return new Response('no key', { status: 401 })
    if (url.origin !== HOST || (init?.method ?? 'GET') !== 'GET') {
      return new Response('unexpected', { status: 404 })
    }
    const parts = url.pathname.replace(/^\/api\/v1\//, '').split('/')
    if (!url.pathname.startsWith('/api/v1/')) return new Response('no api root', { status: 404 })
    const q = url.searchParams

    // GET Pipeline/{id}/stages
    if (parts.length === 3 && parts[0] === 'Pipeline' && parts[2] === 'stages') {
      for (const k of q.keys()) if (!LINK_KEYS.has(k)) return json({ bad: k }, 400)
      const offset = Number(q.get('offset') ?? '0')
      const maxSize = Number(q.get('maxSize') ?? '20')
      if (!offsetOk(offset) || !sizeOk(maxSize)) return json({ bad: 'range' }, 400)
      const all = [...(state.stages[decodeURIComponent(parts[1]!)] ?? [])]
      if (q.get('orderBy') === 'order') {
        all.sort((a, b) => Number(a['order']) - Number(b['order']))
        if (q.get('order') === 'desc') all.reverse()
      }
      const list = all.slice(offset, offset + maxSize)
      const total = totalOf(all, offset, list.length, mode)
      return json(total === undefined ? { list } : { list, total })
    }

    if (parts.length !== 1) return new Response('unknown path', { status: 404 })
    const all = state.entities[parts[0]!]
    if (!all) return new Response(`no entity type ${parts[0]}`, { status: 404 })

    let offset: unknown
    let maxSize: unknown
    let where: unknown
    if (q.has('searchParams')) {
      if ([...q.keys()].length !== 1) return json({ bad: 'mixed params' }, 400)
      const sp = JSON.parse(q.get('searchParams')!) as Record<string, unknown>
      for (const k of Object.keys(sp)) if (!SEARCH_KEYS.has(k)) return json({ bad: k }, 400)
      offset = sp['offset'] ?? 0
      maxSize = sp['maxSize'] ?? 20
      where = sp['where']
    } else {
      for (const k of q.keys()) if (!LIST_KEYS.has(k)) return json({ bad: k }, 400)
      offset = Number(q.get('offset') ?? '0')
      maxSize = Number(q.get('maxSize') ?? '20')
    }
    if (!offsetOk(offset) || !sizeOk(maxSize)) return json({ bad: 'range' }, 400)
    const rows = all.filter((r) => matches(r, where))
    const list = rows.slice(offset, offset + maxSize)
    const total = totalOf(rows, offset, list.length, mode)
    return json(total === undefined ? { list } : { list, total })
  })
  return state
}
