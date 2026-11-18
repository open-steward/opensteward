import axios, { type AxiosInstance } from 'axios'
import { FLASH_EXPRESS_API_BASE, FLASH_EXPRESS_TRAINING_API_BASE } from './constants'
import { flashExpressSign, makeNonceStr, mchIdOf } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * "The Basic Response Data Format" (https://open-docs.flashexpress.com/):
 * `{"code": 1, "message": "success", "data": null}`; "code | integer |
 * ResponseCode", where the Response Code table has "1 | success".
 */
export interface FlashExpressEnvelope<T> {
  code: number
  message: string
  data: T
}

/**
 * Response codes from the "Response Code" table that name a missing record or
 * a rejected merchant: "1001 | customer not found", "1002 | invalid
 * signature", "1006 | order not found", "1007 | warehouse not found",
 * "1019 | pno and mchId not match".
 */
const NOT_FOUND_CODES = new Set([1006, 1007, 1019])
const AUTH_CODES = new Set([1001, 1002])

/**
 * This client signs against the Thailand hosts only. The same doc site
 * documents separate hosts for Malaysia, the Philippines and Laos
 * ("Production Environment：https://open-api.flashexpress.my",
 * "Production Environment： https://open-api.flashexpress.ph",
 * "Production：https://open-api.flashexpress.la/"). The adapter has no region
 * setting to select them, so a merchant from those countries is rejected
 * here with 1001/1002.
 */
const REGION_HINT =
  ' (this connection calls the Thailand host; Malaysia, Philippines and Laos merchants are ' +
  'served from their own Flash Express hosts, which this adapter does not select)'

/**
 * Flash Express Open API client (https://open-docs.flashexpress.com/, "The
 * Basic Standard"): "Request Method: POST"; "Request datas use the
 * application/x-www-form-urlencoded format, and the response data use the
 * json format". Every request carries `mchId`, a fresh `nonceStr` and the
 * SHA256 `sign` in the form body; there is no auth header.
 */
export class FlashExpressClient {
  private http: AxiosInstance
  private mchId: string
  private secretKey: string

  constructor(credentials: Credentials, options: { sandbox?: boolean } = {}) {
    this.mchId = mchIdOf(credentials)
    this.secretKey = credentials.accessToken
    this.http = axios.create({
      baseURL: options.sandbox ? FLASH_EXPRESS_TRAINING_API_BASE : FLASH_EXPRESS_API_BASE,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    })
  }

  /**
   * POST the signed form. Path variables are "not involved in the signature",
   * so only `fields` plus mchId and nonceStr are signed. A body whose `code`
   * is not 1 is thrown, never read as an empty result.
   */
  async post<T>(path: string, fields: Record<string, unknown> = {}): Promise<T> {
    const form: Record<string, string> = {}
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue
      if (typeof v === 'object') {
        // The documented body is flat key=value pairs; an object has no documented encoding.
        throw new TypeError(`Flash Express takes flat form fields; ${k} is an object`)
      }
      form[k] = String(v)
    }
    return withRetry(async () => {
      const signed: Record<string, string> = {
        ...form,
        mchId: this.mchId,
        nonceStr: makeNonceStr(),
      }
      signed['sign'] = flashExpressSign(signed, this.secretKey)
      const { data } = await this.http.post<FlashExpressEnvelope<T>>(
        path,
        new URLSearchParams(signed).toString(),
      )
      if (data?.code !== 1) {
        const code = data?.code
        const statusCode =
          typeof code === 'number' && NOT_FOUND_CODES.has(code)
            ? 404
            : typeof code === 'number' && AUTH_CODES.has(code)
              ? 401
              : 502
        throw Object.assign(
          new Error(
            `Flash Express ${path} answered code ${String(code)}: ${String(data?.message)}` +
              (statusCode === 401 ? REGION_HINT : ''),
          ),
          {
            statusCode,
            code: statusCode === 502 ? 'UPSTREAM_ERROR' : `FLASH_EXPRESS_${String(code)}`,
          },
        )
      }
      return data.data
    })
  }
}
