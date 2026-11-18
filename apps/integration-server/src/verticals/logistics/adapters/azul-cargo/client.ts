import axios, { type AxiosInstance } from 'axios'
import { AZUL_CARGO_API_BASE } from './constants'
import { authenticate, loginFrom } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Every toolkit operation is a POST whose JSON body carries the session token
 * as `Token` (e.g. RastreioRequestModel: "Token","Awb","ChaveNfe","Pedido").
 * The client logs in first, because the spec documents no token lifetime.
 */
export class AzulCargoClient {
  private http: AxiosInstance

  constructor(private readonly credentials: Credentials) {
    this.http = axios.create({
      baseURL: AZUL_CARGO_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await authenticate(loginFrom(this.credentials))
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, { ...body, Token: token })
      return data
    })
  }
}
