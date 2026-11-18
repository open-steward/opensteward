import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BT_PRODUCTION_URL, BT_SANDBOX_URL, BT_VERSION } from './constants'
import { environmentFrom } from './auth'

export class BraintreeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = environmentFrom(credentials) === 'production' ? BT_PRODUCTION_URL : BT_SANDBOX_URL
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        'Braintree-Version': BT_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const { data } = await this.http.post<{ data?: T; errors?: Array<{ message?: string }> }>('', {
      query,
      variables,
    })
    if (data.errors?.length) {
      throw new Error(`Braintree GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`)
    }
    return data.data as T
  }
}
