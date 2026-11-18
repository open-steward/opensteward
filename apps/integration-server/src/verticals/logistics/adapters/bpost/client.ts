import axios, { type AxiosInstance } from 'axios'
import { BPOST_SHM_API_BASE, BPOST_TRACKING_API_BASE } from './constants'
import { accountIdOf, basicAuthHeader, trackingPasswordOf } from './auth'
import { parseXml, type XmlNode } from './xml'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

async function getXmlFrom(http: AxiosInstance, path: string, accept?: string): Promise<XmlNode> {
  return withRetry(async () => {
    const { data } = await http.get<string>(path, {
      headers: accept ? { Accept: accept } : undefined,
      responseType: 'text',
    })
    return parseXml(data)
  })
}

/**
 * Shipping Manager client. Paths are relative to
 * `https://shm-rest.bpost.cloud/services/shm/{accountId}` ("URI:
 * serviceEndPoint/{accountId}/orders/{reference}", manual §C.3.5.1), with
 * static Basic auth (see auth.ts): there is nothing to refresh.
 */
export class BpostClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accountId = accountIdOf(credentials)
    this.http = axios.create({
      baseURL: `${BPOST_SHM_API_BASE}/${encodeURIComponent(accountId)}`,
      headers: { Authorization: basicAuthHeader(accountId, credentials.accessToken) },
    })
  }

  /** GET an XML resource with its versioned media type ("application/vnd.bpost.<servicefamily>-<version>+<format>", §C.3.2.4). */
  async getXml(path: string, accept: string): Promise<XmlNode> {
    return getXmlFrom(this.http, path, accept)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

/**
 * trackingInfo client (manual §E.3.4): `https://api.parcel.bpost.cloud/services/trackedmail`,
 * Basic auth with the account id and the tracking password.
 */
export class BpostTrackingClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accountId = accountIdOf(credentials)
    const password = trackingPasswordOf(credentials)
    this.http = axios.create({
      baseURL: BPOST_TRACKING_API_BASE,
      headers: { Authorization: basicAuthHeader(accountId, password) },
    })
  }

  async getXml(path: string): Promise<XmlNode> {
    return getXmlFrom(this.http, path)
  }
}
