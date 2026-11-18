/**
 * Take Blip HTTP client.
 *
 * All Blip API operations are submitted as LIME protocol commands to a single
 * POST /commands endpoint, per-tenant. The Authorization header uses the
 * "Key" scheme (not "Bearer").
 *
 * Docs: https://docs.blip.ai/#authentication
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE, DESK_DESTINATION, CRM_DESTINATION } from './constants'

/** LIME command response envelope */
export interface CommandResponse<T = unknown> {
  id: string
  from?: string
  method: string
  status: 'success' | 'failure'
  reason?: { code: number; description: string }
  type?: string
  resource?: T
}

/** LIME collection resource */
export interface CollectionResource<T> {
  total?: number
  itemType: string
  items: T[]
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

let _commandCounter = 0
function nextId(): string {
  return `os-${++_commandCounter}-${Date.now()}`
}

export class TakeBlipClient {
  private http: AxiosInstance
  private contractId: string

  constructor(credentials: Credentials) {
    this.contractId = String(credentials.extra?.['contractId'] ?? '')
    const baseURL = API_BASE_URL_TEMPLATE.replace('{contractId}', this.contractId)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Key ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    })
  }

  /**
   * Execute a LIME GET command via POST /commands.
   * @param to      Destination address (e.g. postmaster@desk.msging.net)
   * @param uri     Resource URI (e.g. /tickets?$skip=0&$take=100)
   */
  async command<T>(to: string, uri: string): Promise<CommandResponse<T>> {
    return withRetry(async () => {
      const body = { id: nextId(), to, method: 'get', uri }
      const { data } = await this.http.post<CommandResponse<T>>('/commands', body)
      if (data.status === 'failure') {
        const desc = data.reason?.description ?? 'unknown error'
        throw new Error(`TakeBlip command failed [${data.reason?.code ?? '?'}]: ${desc}`)
      }
      return data
    })
  }

  /**
   * Convenience: desk command (postmaster@desk.msging.net).
   */
  async desk<T>(uri: string): Promise<CommandResponse<T>> {
    return this.command<T>(DESK_DESTINATION, uri)
  }

  /**
   * Convenience: contacts command (postmaster@crm.msging.net).
   */
  async crm<T>(uri: string): Promise<CommandResponse<T>> {
    return this.command<T>(CRM_DESTINATION, uri)
  }
}
