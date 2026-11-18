/**
 * Nuclino API client.
 *
 * Auth: raw API key in the Authorization header (no Bearer prefix).
 * Base URL: https://api.nuclino.com/v0
 * Pagination: cursor-based via the `after` query parameter (UUID).
 *
 * Docs: https://help.nuclino.com/04bc3b92-introduction
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/** Nuclino list envelope: { status, data: { object: "list", results: T[] } } */
export interface NuclinoListEnvelope<T> {
  status: string
  data: {
    object: 'list'
    results: T[]
  }
}

/** Nuclino single-object envelope: { status, data: T } */
export interface NuclinoSingleEnvelope<T> {
  status: string
  data: T
}

export class NuclinoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        // Nuclino API key is passed directly — no Bearer prefix
        Authorization: credentials.accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
