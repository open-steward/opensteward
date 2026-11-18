/**
 * A fake Moskit (Ollow) API v2 that honours only what the docs say.
 *
 * - Host: "Todas as requisições para a API v2 deverão ser enviadas para a URL
 *   base `https://api.ms.prod.ollow.services/v2`." Anything else is refused.
 * - Auth: the `apikey` header; a missing or wrong key gets 401 with
 *   `{"message": "Invalid authentication credentials"}`.
 * - Lists take only the documented query parameters (start, nextPageToken,
 *   quantity, sort, order). "quantity | ... | 10 | 50": default 10, and a
 *   higher value is replaced by the maximum. "start | ... | 0 | start +
 *   quantity de ser menor que 10.000": past that, 422. The body is a bare
 *   array and `X-Ollow-Listing-Total` carries the total.
 * - Paths are the spec's: /contacts, /companies, /deals, /activities,
 *   /pipelines, /stages, their /{id}, and /{deals|contacts|companies}/{id}/notes
 *   and .../notes/{id}.
 */
import { vi } from 'vitest'

export const HOST = 'api.ms.prod.ollow.services'
export const KEY = 'key-1'
export const CREDS = { accessToken: KEY }

const LIST_PARAMS = new Set(['start', 'nextPageToken', 'quantity', 'sort', 'order'])
const TOP = new Set(['contacts', 'companies', 'deals', 'activities', 'pipelines', 'stages'])
const NOTE_PARENTS = new Set(['deals', 'contacts', 'companies'])

export interface FakeStore {
  [collection: string]: Array<{ id: number; [k: string]: unknown }>
}

export type FakeNotes = Record<string, Array<{ id: number; [k: string]: unknown }>>

export interface FakeOptions {
  /**
   * The `X-Ollow-Listing-Total` value to send, given the real total; `null`
   * leaves the header out. Default: the real total. The article lists the
   * header but does not promise it on every response, so the adapter must
   * also end a walk without it.
   */
  totalHeader?: (total: number) => string | null
  /** Other API keys this fake accepts, each with its own account's data. */
  accounts?: Record<string, { store: FakeStore; notes?: FakeNotes }>
}

export interface FakeMoskit {
  sent: URL[]
  /** notes[`deals/300`] = the notes of deal 300. */
  notes: FakeNotes
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function listResponse(
  rows: Array<unknown>,
  url: URL,
  totalHeader: NonNullable<FakeOptions['totalHeader']>,
): Response {
  for (const k of url.searchParams.keys()) {
    if (!LIST_PARAMS.has(k)) return json({ message: `unknown parameter ${k}` }, 400)
  }
  const start = Number(url.searchParams.get('start') ?? '0')
  let quantity = Number(url.searchParams.get('quantity') ?? '10')
  if (!Number.isInteger(start) || start < 0) return json({ message: 'bad start' }, 400)
  if (!Number.isInteger(quantity) || quantity < 1) quantity = 10
  if (quantity > 50) quantity = 50
  if (start + quantity >= 10_000) {
    return json({ message: 'Preview invalid for index records greater than 10000' }, 422)
  }
  const total = totalHeader(rows.length)
  return json(
    rows.slice(start, start + quantity),
    200,
    total === null ? {} : { 'X-Ollow-Listing-Total': total },
  )
}

export function fakeMoskit(
  store: FakeStore,
  notes: FakeNotes = {},
  opts: FakeOptions = {},
): FakeMoskit {
  const sent: URL[] = []
  const totalHeader = opts.totalHeader ?? ((n: number) => String(n))
  const accounts: NonNullable<FakeOptions['accounts']> = {
    ...opts.accounts,
    [KEY]: { store, notes },
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    if (url.host !== HOST || !url.pathname.startsWith('/v2/')) {
      return json({ message: 'no Route matched with those values' }, 404)
    }
    const headers = new Headers(init?.headers)
    const account = accounts[headers.get('apikey') ?? '']
    if (!account) {
      return json({ message: 'Invalid authentication credentials' }, 401)
    }
    const data = account.store
    const accountNotes = account.notes ?? {}
    if ((init?.method ?? 'GET') !== 'GET') return json({ message: 'unexpected method' }, 405)
    const parts = url.pathname.slice('/v2/'.length).split('/')
    const [coll, id, sub, subId] = parts
    if (!coll || (!TOP.has(coll) && !NOTE_PARENTS.has(coll))) {
      return json({ message: 'no Route matched with those values' }, 404)
    }
    if (parts.length === 1) return listResponse(data[coll] ?? [], url, totalHeader)
    if (parts.length === 2) {
      const row = (data[coll] ?? []).find((r) => String(r.id) === id)
      return row ? json(row) : json({ message: 'not found' }, 404)
    }
    if (sub === 'notes' && NOTE_PARENTS.has(coll)) {
      const list = accountNotes[`${coll}/${id}`] ?? []
      if (parts.length === 3) return listResponse(list, url, totalHeader)
      if (parts.length === 4) {
        const row = list.find((r) => String(r.id) === subId)
        return row ? json(row) : json({ message: 'not found' }, 404)
      }
    }
    return json({ message: 'no Route matched with those values' }, 404)
  })
  return { sent, notes }
}

/** `n` rows with ids base+1..base+n. */
export function rows(n: number, base = 0): Array<{ id: number; name: string }> {
  return Array.from({ length: n }, (_, i) => ({ id: base + i + 1, name: `Row ${base + i + 1}` }))
}
