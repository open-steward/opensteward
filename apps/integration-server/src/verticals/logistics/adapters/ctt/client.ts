import axios, { type AxiosInstance } from 'axios'
import { CTT_API_BASE } from './constants'
import { basicAuthHeader, readKeys, requestToken, type CttKeys } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

function status(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/**
 * Every request is HTTP Basic with the token as the username and
 * base64(HMAC-SHA256(token + body, secret)) without padding as the password,
 * plus the X-APPID header (see auth.ts). A GET hashes the empty string: "make
 * sure that with any method (GET for instance) that does not required data to
 * make sure that the calculation is done with no data".
 *
 * Token lifetime, from https://api.pakketmail.nl/v3/apidocs/usa/authenticate:
 * "Check if your token is still valid by checking the expiry date. If not
 * valid, request a new one. ... If you receive a http 401 Not Authorized, it
 * might be that the token is invalidated in the API. Try to get a new token.
 * If the token request succeeds, redo the request you intended to do."
 */
export class CttClient {
  private http: AxiosInstance
  private keys: CttKeys
  private token: string | undefined

  constructor(credentials: Credentials) {
    this.keys = readKeys(credentials)
    const expired =
      credentials.expiresAt !== undefined && new Date(credentials.expiresAt).getTime() <= Date.now()
    this.token = credentials.accessToken && !expired ? credentials.accessToken : undefined
    this.http = axios.create({
      baseURL: CTT_API_BASE,
      headers: {
        'X-APPID': this.keys.appId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private async currentToken(): Promise<string> {
    if (!this.token) this.token = (await requestToken(this.keys)).token
    return this.token
  }

  private async send<T>(method: 'GET' | 'POST', path: string, body: string): Promise<T> {
    const once = async (token: string): Promise<T> => {
      const { data } = await this.http.request<T>({
        method,
        url: path,
        ...(method === 'GET' ? {} : { data: body }),
        headers: { Authorization: basicAuthHeader(token, body, this.keys.secretKey) },
      })
      return data
    }
    return withRetry(async () => {
      try {
        return await once(await this.currentToken())
      } catch (err) {
        if (status(err) !== 401) throw err
        this.token = (await requestToken(this.keys)).token
        return once(this.token)
      }
    })
  }

  async get<T>(path: string): Promise<T> {
    return this.send<T>('GET', path, '')
  }

  /** The body is hashed exactly as sent, so it is serialised once, here. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>('POST', path, JSON.stringify(body))
  }
}
