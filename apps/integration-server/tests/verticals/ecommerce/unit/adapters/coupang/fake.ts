/**
 * A fake Coupang for adapter tests: axios.create returns an instance whose
 * GET is routed to handlers by path. Each handler receives only the query the
 * adapter sent, and the test's handlers honour only documented parameters.
 */
import { vi } from 'vitest'
import axios from 'axios'

export interface Call {
  path: string
  params: Record<string, unknown>
}

export type Handler = (params: Record<string, unknown>, path: string) => unknown

export const CREDS = {
  accessToken: 'access-key',
  extra: { secretKey: 'secret', vendorId: 'A00012345' },
}

/** Route GETs to the first handler whose pattern matches; anything else throws. */
export function fakeCoupang(routes: Array<[RegExp, Handler]>): Call[] {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    for (const [pattern, handler] of routes) {
      if (pattern.test(path)) return { data: handler(params, path) }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    interceptors: { request: { use: vi.fn() } },
  } as never)
  return calls
}

/** A cursor token the fakes mint for a row offset, and read back. */
export const tokenFor = (offset: number): string => `tok-${offset + 1000}`
export const offsetOf = (token: unknown): number =>
  token === undefined || String(token) === '1' ? 0 : Number(String(token).slice(4)) - 1000
