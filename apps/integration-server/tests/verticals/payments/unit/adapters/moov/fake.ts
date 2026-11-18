/**
 * A fake Moov API behind axios's transport (`axios.defaults.adapter`), which
 * every axios call and every instance created afterwards dispatches through.
 *
 * It honours only what Moov documents:
 *   - GET /accounts/{accountID}/transfers with the query parameters `skip` and
 *     `count` ("skip integer <int64>", "count integer <int64> Page size. When
 *     omitted, the server defaults to 200."), any other query parameter is
 *     refused;
 *   - GET /accounts/{accountID}/transfers/{transferID};
 *   - Basic auth: "Set the Authorization header to Basic <credentials>, where
 *     credentials is the Base64 encoding of public key and private key joined
 *     by a single colon" (https://docs.moov.io/api/authentication/api-authentication/).
 * https://docs.moov.io/api/money-movement/transfers/list/ and /get/.
 */
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { vi } from 'vitest'

export interface SeenRequest {
  method: string
  url: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
}

export interface FakeMoov {
  requests: SeenRequest[]
  restore: () => void
}

const DOCUMENTED_LIST_PARAMS = new Set(['skip', 'count'])

export function installFakeMoov(opts: {
  accountID: string
  transfers: Array<Record<string, unknown>>
  publicKey: string
  privateKey: string
}): FakeMoov {
  const requests: SeenRequest[] = []
  const original = axios.defaults.adapter
  const expectedAuth = `Basic ${Buffer.from(`${opts.publicKey}:${opts.privateKey}`).toString('base64')}`

  const transport: AxiosAdapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    const url = new URL(config.url ?? '', config.baseURL ?? 'http://invalid.test')
    const params = { ...(config.params as Record<string, unknown> | undefined) }
    const headers = config.headers.toJSON() as Record<string, unknown>
    requests.push({
      method: (config.method ?? 'get').toUpperCase(),
      url: url.toString(),
      params,
      headers,
    })
    const respond = (status: number, data: unknown) => {
      if (status >= 400) {
        const err = Object.assign(new Error(`Request failed with status code ${status}`), {
          isAxiosError: true,
          response: { status, data, headers: {}, config, statusText: '' },
          config,
        })
        throw err
      }
      return { data, status, statusText: 'OK', headers: {}, config }
    }
    if (url.origin !== 'https://api.moov.io') return respond(404, { error: 'unknown host' })
    if (headers['Authorization'] !== expectedAuth) return respond(401, {})
    const base = `/accounts/${encodeURIComponent(opts.accountID)}/transfers`
    if (url.pathname === base) {
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED_LIST_PARAMS.has(k)) return respond(422, { [k]: 'undocumented' })
      }
      const skip = params['skip'] === undefined ? 0 : Number(params['skip'])
      const count = params['count'] === undefined ? 200 : Number(params['count'])
      return respond(200, opts.transfers.slice(skip, skip + count))
    }
    if (url.pathname.startsWith(`${base}/`)) {
      const id = decodeURIComponent(url.pathname.slice(base.length + 1))
      const found = opts.transfers.find((t) => t['transferID'] === id)
      return found ? respond(200, found) : respond(404, {})
    }
    return respond(404, {})
  }) as unknown as AxiosAdapter

  axios.defaults.adapter = transport
  return {
    requests,
    restore: () => {
      axios.defaults.adapter = original
    },
  }
}
