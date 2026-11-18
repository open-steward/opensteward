/**
 * ECCANG HTTP client.
 *
 * All operations go through a single unified gateway (POST /openApi/api/appUnity).
 * The `interface_method` field in the request body selects the operation.
 *
 * Request structure:
 *   {
 *     interface_method: string,   // e.g. 'getGoodsList'
 *     system_name:      string,   // 'ERP'
 *     version:          string,   // 'V1.0.0'
 *     token:            string,   // user/tenant access token
 *     subject_code:     string,   // tenant identifier
 *     biz_content:      string,   // JSON-encoded business params
 *   }
 *
 * Response envelope:
 *   { code: number, msg: string, data: T, total?: number }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_PATH, SYSTEM_NAME, API_VERSION } from './constants'

export interface EccangEnvelope<T> {
  code: number
  msg?: string
  data?: T
  total?: number
  page?: number
  page_size?: number
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class EccangClient {
  private http: AxiosInstance
  private token: string
  private subjectCode: string

  constructor(credentials: Credentials) {
    const appKey = credentials.accessToken
    this.token = String(credentials.extra?.['token'] ?? '')
    this.subjectCode = String(credentials.extra?.['subjectCode'] ?? '')
    if (!appKey) throw new Error('eccang requires credentials.accessToken (appKey)')
    if (!this.token) throw new Error('eccang requires credentials.extra.token')
    if (!this.subjectCode) throw new Error('eccang requires credentials.extra.subjectCode')

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        appKey,
      },
      timeout: 30_000,
    })
  }

  /**
   * Call the ECCANG unified gateway.
   *
   * @param interfaceMethod  The operation name (e.g. 'getGoodsList')
   * @param bizContent       Business parameters; will be JSON-stringified
   */
  async call<T>(interfaceMethod: string, bizContent: Record<string, unknown> = {}): Promise<EccangEnvelope<T>> {
    return withRetry(async () => {
      const body = {
        interface_method: interfaceMethod,
        system_name: SYSTEM_NAME,
        version: API_VERSION,
        token: this.token,
        subject_code: this.subjectCode,
        biz_content: JSON.stringify(bizContent),
      }
      const { data } = await this.http.post<EccangEnvelope<T>>(API_PATH, body)
      return data
    })
  }
}
