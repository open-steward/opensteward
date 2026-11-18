/**
 * SalesNexus API client.
 *
 * All calls are HTTP POST to a single endpoint with a JSON array of function
 * objects. Authentication is embedded in each function's `parameters` as the
 * `login-token` field (the permanent API key or a session token).
 *
 * Docs: https://logon.salesnexus.com/api/docs/api-v1
 */
import type { Credentials } from '@opensteward/shared'
import { SALESNEXUS_BASE_URL } from './constants'

/** A single SalesNexus API function object. */
export interface SalesnexusFunction {
  function: string
  parameters: Record<string, unknown>
  'request-id'?: string
}

/** The envelope returned for every SalesNexus API call. */
export interface SalesnexusResponse<T = unknown> {
  /** The function name echoed back. */
  function?: string
  /** Echoed request-id. */
  'request-id'?: string
  /** Whether the call succeeded. */
  successful?: boolean
  /** Error message when `successful` is false. */
  error?: string
  /** The payload — shape varies by function. */
  result?: T
}

export class SalesnexusClient {
  private loginToken: string

  constructor(credentials: Credentials) {
    // credentials.accessToken holds the permanent API key / session token.
    this.loginToken = credentials.accessToken
  }

  /**
   * Execute one SalesNexus API function and return its result.
   *
   * SalesNexus accepts an array of function calls in a single POST and returns
   * an array of results. We send one at a time for simplicity.
   */
  async call<T>(fn: string, parameters: Record<string, unknown>, requestId?: string): Promise<T> {
    const payload: SalesnexusFunction[] = [
      {
        function: fn,
        parameters: {
          'login-token': this.loginToken,
          ...parameters,
        },
        'request-id': requestId ?? fn,
      },
    ]

    const res = await fetch(SALESNEXUS_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`SalesNexus API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    const json = (await res.json()) as SalesnexusResponse<T>[]
    const first = Array.isArray(json) ? json[0] : (json as SalesnexusResponse<T>)

    if (first?.successful === false) {
      const msg = first.error ?? 'Unknown SalesNexus API error'
      throw Object.assign(new Error(`SalesNexus API error: ${msg}`), { statusCode: 400 })
    }

    return first?.result as T
  }
}
