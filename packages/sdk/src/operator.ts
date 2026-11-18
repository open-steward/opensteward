/**
 * Operator SDK client.
 *
 * Wraps `openapi-fetch` for `admin-api` and adds JWT auth helpers so
 * operator scripts and the `os` CLI don't have to wire login + token
 * storage themselves.
 *
 * The typed path surface is inherited from `./generated/operator-types`,
 * regenerated from `docs/openapi/admin-api.openapi.json` via
 * `pnpm sdk:generate`.
 */
import { readFileSync } from 'node:fs'

import createClient, { type Client, type ClientOptions, type Middleware } from 'openapi-fetch'

import type { paths as OperatorPaths } from './generated/operator-types.js'

export interface CreateOperatorClientOptions {
  /** Base URL of admin-api, e.g. `http://localhost:3001`. */
  baseUrl: string
  /** Optional initial JWT — skip `.login()` when you already have a token. */
  token?: string
  /** Optional extra `openapi-fetch` config. */
  options?: Omit<ClientOptions, 'baseUrl'>
}

/** Shape of `~/.config/opensteward/credentials.json`. */
export interface CredentialsFile {
  /** JWT minted by `POST /api/auth/login`. */
  token: string
  /** Optional — recorded so callers can sanity-check before reusing. */
  baseUrl?: string
}

/** Response of `POST /api/auth/login` — `{ token, user }` per admin-api. */
interface LoginResponse {
  token: string
}

export type OperatorClient = Client<OperatorPaths> & {
  /** Current stored JWT, or `null` before `.login()` / `.setToken()`. */
  getToken(): string | null
  /** Replace the stored JWT (e.g. you minted one out-of-band). */
  setToken(jwt: string | null): void
  /** POST `/api/auth/login`, store the resulting JWT, return the user payload. */
  login(username: string, password: string): Promise<LoginResponse>
  /** POST `/api/auth/logout` and clear the stored JWT. */
  logout(): Promise<void>
  /** Load a JWT from a credentials file at the given path (synchronous read). */
  fromCredentialsFile(path: string): void
}

export function createOperatorClient(opts: CreateOperatorClientOptions): OperatorClient {
  const { baseUrl, options } = opts
  let token: string | null = opts.token ?? null

  // `openapi-fetch` middleware injects `Authorization` on every request
  // whenever a token is set, so callers don't have to thread it through
  // each call site. Setting `token = null` short-circuits the header.
  const authMiddleware: Middleware = {
    onRequest({ request }) {
      if (token) request.headers.set('Authorization', `Bearer ${token}`)
      return request
    },
  }

  const client = createClient<OperatorPaths>({ ...options, baseUrl })
  client.use(authMiddleware)

  // `as unknown as` — the typed `paths` object doesn't include the
  // helper methods we're bolting on; the augmented `OperatorClient`
  // type above exposes them to consumers.
  const op = client as unknown as OperatorClient

  op.getToken = () => token
  op.setToken = (jwt) => {
    token = jwt
  }

  op.login = async (username, password) => {
    // Hand-rolled fetch here because the operator-types file gates this
    // endpoint behind a Bearer-auth security scheme that doesn't apply
    // at login time. Using the raw API also keeps the helper agnostic
    // of generated-type changes (the field is documented to be `token`).
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      throw new Error(`login failed: ${res.status} ${res.statusText}`)
    }
    const body = (await res.json()) as LoginResponse
    token = body.token
    return body
  }

  op.logout = async () => {
    if (token) {
      // Best-effort: even if logout 4xx's (already-expired token, etc.),
      // we still drop the local copy so the caller can re-login cleanly.
      try {
        await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        /* swallow — we're clearing local state regardless */
      }
    }
    token = null
  }

  op.fromCredentialsFile = (path) => {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as CredentialsFile
    if (!parsed.token || typeof parsed.token !== 'string') {
      throw new Error(`credentials file at ${path} is missing a "token" field`)
    }
    token = parsed.token
  }

  return op
}
