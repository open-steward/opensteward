/**
 * Tiny ERP API v3 HTTP client.
 *
 * Auth header: Bearer <access_token>
 * Base URL:    https://api.tiny.com.br/public-api/v3
 * Pagination:  ?limit=<n>&offset=<n>  — responses include { itens[], paginacao }
 */

import axios, { type AxiosInstance } from 'axios'
import { TINY_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface TinyPaginacao {
  totalRegistros: number
  limite: number
  offset: number
}

export interface TinyListResponse<T> {
  itens: T[]
  paginacao: TinyPaginacao
}

export class TinyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${TINY_API_BASE}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async list<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<TinyListResponse<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get<TinyListResponse<T>>(path, { params })
      return data
    })
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path)
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
