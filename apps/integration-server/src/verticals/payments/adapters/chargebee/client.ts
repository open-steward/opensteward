import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, hostFor } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ChargebeeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const site = String(
      (credentials.extra as Record<string, unknown> | undefined)?.site ?? '',
    )
    this.http = axios.create({
      baseURL: `${hostFor(site)}/api/${API_VERSION}`,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    // Chargebee accepts form-encoded bodies with bracket notation for
    // nested objects, identical to Stripe — port that helper.
    return withRetry(async () => {
      const form = body ? toForm(body) : undefined
      const { data } = await this.http.post<T>(path, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }
}

export function toForm(body: Record<string, unknown>): string {
  const out = new URLSearchParams()
  const walk = (prefix: string, v: unknown): void => {
    if (v == null) return
    if (Array.isArray(v)) {
      v.forEach((vi, i) => walk(`${prefix}[${i}]`, vi))
      return
    }
    if (typeof v === 'object') {
      for (const [k, vi] of Object.entries(v as Record<string, unknown>)) {
        walk(`${prefix}[${k}]`, vi)
      }
      return
    }
    out.append(prefix, String(v))
  }
  for (const [k, v] of Object.entries(body)) walk(k, v)
  return out.toString()
}
