/**
 * Agiloft REST interface client.
 *
 * Every operation is `GET https://{host}/ewws/{operation}/.json` with the
 * knowledge base in `$KB` (REST Interface, "GET/POST" URL convention:
 * "/ewws/{operation}?$KB={kbName}&$table={table}&…"). The OAuth2 access token
 * goes in the header — "The token can then be used in an Authorization request
 * header, prefixed by the authentication scheme, instead of including the
 * login and password parameters" — so no credentials are ever put in a URL.
 *
 * `/.json` is the documented JSON decorator. Its reply is
 * `{"success":true,"message":"","result":…}`; `err_code_resp=1` asks for
 * "specific response codes, rather than the default behavior of receiving code
 * 200", so a failure arrives as an HTTP error status (TRANSIENT_STATUSES says
 * which of those are retried). A reply that is not `success: true`
 * is an error, never an empty result.
 *
 * Host + KB come from `credentials.extra` (set at OAuth exchange). There is no
 * default host: a connection without one is refused rather than sent somewhere
 * else with the customer's token.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { connectionAgiloftHost, normaliseAgiloftKb } from './auth'
import { EWWS_PATH, LANG } from './constants'

/**
 * Statuses worth retrying. A plain 500 is not one. With `err_code_resp=1` the
 * REST Interface error table maps permanent failures to 500: "Token has been
 * revoked or session is no longer active | AUTHORIZATION | 500 |
 * EWUnexpectedException → No active session found for current token", a
 * duplicate unique value, a string for a Long parameter. Retrying 500 would
 * only delay a revoked-token failure by ~15s. 429 and 502/503/504 are not in
 * that table; they come from whatever sits in front of the server and are
 * transient by HTTP's own definition.
 */
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504])

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (status !== undefined && TRANSIENT_STATUSES.has(status) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** The JSON decorator's reply: {"success":true,"message":"","result":{…}}. */
interface AgiloftJsonReply<T> {
  success?: boolean
  message?: string
  result?: T
}

export class AgiloftClient {
  private http: AxiosInstance
  private kb: string

  constructor(credentials: Credentials, fallbackHost?: string, fallbackKb?: string) {
    const host = connectionAgiloftHost(credentials, fallbackHost)
    const storedKb = credentials.extra?.['kb']
    this.kb = normaliseAgiloftKb(typeof storedKb === 'string' ? storedKb : fallbackKb)
    this.http = axios.create({
      baseURL: `https://${host}${EWWS_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Run one operation on one table and return its `result`. Array params go
   * out as repeated pairs (`field=id&field=summary`), the shape every Search
   * example uses.
   */
  async call<T>(
    operation: string,
    table: string,
    params: Record<string, unknown>,
    emptyResult?: T,
  ): Promise<T> {
    const reply = await withRetry(async () => {
      const { data } = await this.http.get<AgiloftJsonReply<T>>(`/${operation}/.json`, {
        params: { $KB: this.kb, $table: table, $lang: LANG, ...params, err_code_resp: 1 },
        paramsSerializer: { indexes: null },
      })
      return data
    })
    if (reply?.success !== true) {
      throw new Error(
        `Agiloft ${operation} failed: ${reply?.message || 'reply is not success:true'}`,
      )
    }
    if (reply.result === undefined) {
      // Only a caller that passes `emptyResult` accepts a successful reply
      // with no result (EWSearch: "When a page is not found, an empty result
      // is returned.", REST - Search). For anything else it is an error.
      if (emptyResult !== undefined) return emptyResult
      throw new Error(`Agiloft ${operation} failed: no result in the reply`)
    }
    return reply.result
  }
}
