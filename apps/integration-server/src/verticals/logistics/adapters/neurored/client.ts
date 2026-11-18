import axios, { type AxiosInstance } from 'axios'
import { NEURORED_API_VERSION } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Neurored Salesforce-native TMS.
 *
 * Neurored exposes data through the standard Salesforce REST API and SOQL
 * query endpoint on the org's instance URL (e.g. https://myorg.my.salesforce.com).
 * The instance URL is stored in credentials.extra.instanceUrl after OAuth2 login.
 */
export class NeuroredClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    const instanceUrl = this.instanceUrl(credentials)
    this.http = axios.create({
      baseURL: `${instanceUrl}/services/data/${NEURORED_API_VERSION}`,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private instanceUrl(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const url = extra.instanceUrl
    if (typeof url !== 'string' || !url) {
      throw new Error('Neurored: instanceUrl is missing from credentials.extra — re-authenticate')
    }
    return url
  }

  private async ensureAuth(): Promise<void> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
      this.http.defaults.headers.common['Authorization'] = authHeader(this.credentials.accessToken)
      // Update baseURL if instance URL changed (rare but possible on sandbox refresh)
      this.http.defaults.baseURL = `${this.instanceUrl(this.credentials)}/services/data/${NEURORED_API_VERSION}`
    }
  }

  /**
   * Execute a SOQL query via the Salesforce /query endpoint.
   */
  async query<T>(soql: string): Promise<{ totalSize: number; done: boolean; records: T[] }> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.get<{ totalSize: number; done: boolean; records: T[] }>(
        '/query',
        { params: { q: soql } },
      )
      return data
    })
  }

  /**
   * Fetch all pages of a SOQL query, following nextRecordsUrl until done.
   */
  async queryAll<T>(soql: string): Promise<T[]> {
    const records: T[] = []
    let result = await this.query<T>(soql)
    records.push(...result.records)

    while (!result.done) {
      result = await this.query<T>(soql)
      records.push(...result.records)
    }

    return records
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.ensureAuth()
      await this.http.delete(path)
    })
  }
}
