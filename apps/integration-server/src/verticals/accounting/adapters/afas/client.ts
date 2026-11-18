/**
 * AFAS Profit REST API HTTP client.
 *
 * All requests are authenticated via the AfasToken header:
 *   Authorization: AfasToken <base64('<token><version>1</version><data>{apiKey}</data></token>')>
 *
 * The base URL is environment-specific:
 *   https://{environmentId}.rest.afas.online/profitrestservices/connectors/
 *
 * Pagination uses `skip` (offset) and `take` (page size) query parameters.
 * Responses contain a `rows` array with the result records.
 */
import axios, { type AxiosInstance } from 'axios'
import { AFAS_API_BASE_TEMPLATE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'
import { buildAfasAuthHeader } from './auth'

function buildBaseUrl(credentials: Credentials): string {
  const environmentId = (credentials.extra?.['environmentId'] as string | undefined) ?? ''
  return AFAS_API_BASE_TEMPLATE.replace('{environmentId}', environmentId)
}

/** Standard AFAS GetConnector response envelope */
export interface AfasListResponse<T> {
  rows: T[]
}

export class AfasClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
      headers: {
        Authorization: buildAfasAuthHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
