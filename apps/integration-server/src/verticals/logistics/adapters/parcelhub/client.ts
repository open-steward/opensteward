import axios, { type AxiosInstance } from 'axios'
import { PARCELHUB_API_BASE, PARCELHUB_TRACKING_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
import { parseXml, type XmlNode } from './xml'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/** Shipping API client: https://api.parcelhub.net/1.0/ with the TokenV2 bearer token. */
export class ParcelHubClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: PARCELHUB_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** GET a Shipping API resource. Every documented response is `application/xml`. */
  async getXml(path: string): Promise<XmlNode> {
    return withRetry(async () => {
      const { data } = await this.http.get<string>(path, {
        headers: { Accept: 'application/xml' },
        responseType: 'text',
      })
      return parseXml(String(data))
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

/**
 * Tracking API client. https://api.parcelhub.net/docs/trackingAPI/tracking-api/ :
 * "In order to make API request a Parcelhub Account ID and an Access Code is
 * required to access the API. This is a seperate credential to the one used in
 * the shipping API". The credentials travel in each XML request body.
 */
export async function postTrackingXml(operation: string, body: string): Promise<XmlNode> {
  return withRetry(async () => {
    const { data } = await axios.post<string>(`${PARCELHUB_TRACKING_API_BASE}${operation}`, body, {
      headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
      responseType: 'text',
    })
    return parseXml(String(data))
  })
}
