/**
 * RealBooks HTTP client.
 *
 * Every RealBooks API call is a POST request with JSON body.  Auth credentials
 * (secretKey / accessKey / emailid) are injected into each request body.
 * The company-level cid/segid are either path params (write endpoints) or
 * body params (report/fetch endpoints) — callers pass them explicitly.
 *
 * Mandatory request headers (per RealBooks API docs):
 *   Content-Type  : application/json
 *   accountName   : <customer domain name>
 *   rootUrl       : https://api.realbooks.in
 */

import axios, { type AxiosInstance } from 'axios'
import { REALBOOKS_API_BASE, REALBOOKS_ROOT_URL_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface RealBooksAuthBody {
  secretKey: string
  accessKey: string
  emailid: string
}

export class RealBooksClient {
  private http: AxiosInstance
  private authBody: RealBooksAuthBody
  readonly cid: string
  readonly segid: string

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    this.authBody = {
      secretKey: credentials.accessToken,
      accessKey: (extra['accessKey'] as string | undefined) ?? credentials.accessToken,
      emailid: (extra['emailid'] as string | undefined) ?? '',
    }
    this.cid = (extra['cid'] as string | undefined) ?? '0'
    this.segid = (extra['segid'] as string | undefined) ?? '0'
    const accountName = (extra['accountName'] as string | undefined) ?? ''

    this.http = axios.create({
      baseURL: REALBOOKS_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        accountName,
        rootUrl: REALBOOKS_ROOT_URL_HEADER,
      },
    })
  }

  /**
   * Execute a POST request, automatically merging auth fields into the body.
   * `path` may contain `{cid}` and `{segid}` placeholders.
   */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const resolvedPath = path
      .replace('{cid}', this.cid)
      .replace('{segid}', this.segid)

    const payload = {
      ...this.authBody,
      ...body,
    }

    return withRetry(async () => {
      const { data } = await this.http.post<T>(resolvedPath, payload)
      return data
    })
  }

  /**
   * POST a fetch/report call that expects cid/segid in the body rather than
   * the path.
   */
  async fetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const payload = {
      ...this.authBody,
      cid: Number(this.cid),
      segid: Number(this.segid),
      ...body,
    }

    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, payload)
      return data
    })
  }
}
