import axios, { type AxiosInstance } from 'axios'
import { ZOHO_DEFAULT_DATA_CENTRE, zohoBooksApiBase } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ZohoBooksClient {
  private http: AxiosInstance
  private organizationId: string

  /**
   * The organization and data centre recorded with the credentials win; the
   * fallbacks only serve connections made before they were recorded.
   */
  constructor(credentials: Credentials, fallbackOrganizationId?: string, fallbackDataCentre?: string) {
    const storedOrg = credentials.extra?.['organizationId']
    this.organizationId =
      credentials.tenantId ||
      (typeof storedOrg === 'string' || typeof storedOrg === 'number' ? String(storedOrg) : '') ||
      fallbackOrganizationId ||
      ''
    const storedDc = credentials.extra?.['dataCentre']
    const dataCentre =
      typeof storedDc === 'string' && storedDc.trim()
        ? storedDc
        : (fallbackDataCentre ?? ZOHO_DEFAULT_DATA_CENTRE)
    this.http = axios.create({
      baseURL: `${zohoBooksApiBase(dataCentre)}/`,
      headers: {
        Authorization: `Zoho-oauthtoken ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      params: { organization_id: this.organizationId },
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
}
