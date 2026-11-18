import axios, { type AxiosInstance } from 'axios'
import { EXACT_DEFAULT_REGION, getBaseUrl } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ExactOnlineClient {
  private http: AxiosInstance
  readonly divisionId: string

  /**
   * @param fallbackRegion Used only for connections made before the region was
   *   recorded in `credentials.extra.region`.
   */
  constructor(credentials: Credentials, fallbackRegion?: string) {
    const storedDivision = credentials.extra?.['division']
    const division =
      credentials.tenantId ||
      (typeof storedDivision === 'string' || typeof storedDivision === 'number' ? String(storedDivision) : '')
    if (!division) {
      throw new Error(
        'Exact Online division is missing from the connection; reconnect it so the division is recorded.',
      )
    }
    this.divisionId = division
    const storedRegion = credentials.extra?.['region']
    const region =
      typeof storedRegion === 'string' && storedRegion.trim()
        ? storedRegion
        : (fallbackRegion ?? EXACT_DEFAULT_REGION)
    this.http = axios.create({
      baseURL: `${getBaseUrl(region)}/v1/${this.divisionId}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
