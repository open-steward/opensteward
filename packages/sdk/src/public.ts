/**
 * Public (tenant developer) SDK client.
 *
 * Thin wrapper around `openapi-fetch` that prefills the `Authorization: Bearer`
 * header. The full typed surface — every path, method, request body, query, and
 * response — is inherited from `./generated/public-types`, which is regenerated
 * from `docs/openapi/openapi.json` by `pnpm sdk:generate`.
 *
 * Two credentials reach the same routes. A static `osk_` API key, or a
 * short-lived OIDC bearer token from whichever identity provider the operator
 * has registered. Both resolve to the same scopes server-side, so nothing else
 * about using this client differs — but a token expires, so it is supplied as a
 * function rather than a string.
 *
 * **On the version prefix.** The spec strips `/v1/` from versioned path keys
 * and re-supplies it through the root server template, so `paths` holds
 * `/accounting/invoices` while the wire path is `/v1/accounting/invoices`.
 * openapi-fetch has no notion of a server template — it joins `baseUrl` and
 * the path key — so passing a bare host would produce
 * `http://host/accounting/invoices` and a 404 on every versioned call. The
 * client owns the prefix, which is also what makes `mode` a one-word switch
 * rather than a second base URL to keep in sync.
 */
import createClient, { type Client, type ClientOptions, type Middleware } from 'openapi-fetch'

import type { paths as PublicPaths } from './generated/public-types.js'
import { UNVERSIONED_PATHS } from './generated/public-unversioned.js'

/**
 * Which surface to call.
 *
 * `'live'` talks to the real integrations. `'test'` talks to the sandbox —
 * synthetic data, no upstream calls, and a key minted with `--test`. The two
 * never share a credential: a live key on `/test/v1/*` is `403
 * KEY_MODE_MISMATCH`, and so is the reverse.
 */
export type ApiMode = 'live' | 'test'

interface CommonOptions {
  /**
   * Base URL of the integration-server, WITHOUT the version segment —
   * e.g. `https://api.example.com`. The client appends `/v1` or `/test/v1`.
   */
  baseUrl: string
  /** Defaults to `'live'`. `'test'` routes versioned paths at `/test/v1`. */
  mode?: ApiMode
  /** URL-path API version. Defaults to `'v1'`. */
  version?: string
  /** Optional extra `openapi-fetch` config — headers, fetch, query serializer, etc. */
  options?: Omit<ClientOptions, 'baseUrl' | 'headers'> & { headers?: HeadersInit }
}

/** `/v1`, or `/test/v1` in sandbox mode. */
export function basePathFor(mode: ApiMode = 'live', version = 'v1'): string {
  return mode === 'test' ? `/test/${version}` : `/${version}`
}

/**
 * Prefix the version per PATH rather than by baking it into `baseUrl`, because
 * the spec carries two namespaces and openapi-fetch has only one base URL.
 * `/admin/*`, `/auth/*`, `/health`, `/webhooks/*` and the sandbox control
 * routes are absolute; the generated set says which, so it cannot drift.
 */
function versionPrefix(basePath: string): Middleware {
  return {
    onRequest({ request, schemaPath }) {
      if (UNVERSIONED_PATHS.has(schemaPath)) return request
      const url = new URL(request.url)
      url.pathname = basePath + url.pathname
      return new Request(url, request)
    },
  }
}

export interface ApiKeyClientOptions extends CommonOptions {
  /** Tenant Bearer API key (`osk_…`). Sent on every request. */
  apiKey: string
  getAccessToken?: never
}

export interface TokenClientOptions extends CommonOptions {
  apiKey?: never
  /**
   * Called before every request to supply an OIDC bearer token.
   *
   * Per-request rather than a fixed string because these expire. Return a
   * cached token and refresh it yourself, or hand this
   * `clientCredentialsTokenSource(...)`, which does the caching.
   */
  getAccessToken: () => string | Promise<string>
}

export type CreatePublicClientOptions = ApiKeyClientOptions | TokenClientOptions

export type PublicClient = Client<PublicPaths>

export function createPublicClient(opts: CreatePublicClientOptions): PublicClient {
  const { baseUrl, mode = 'live', version = 'v1', options } = opts
  const extra = (options?.headers as Record<string, string> | undefined) ?? {}
  const root = baseUrl.replace(/\/+$/, '')
  const prefix = versionPrefix(basePathFor(mode, version))

  if (opts.apiKey !== undefined) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      ...extra,
    }
    const keyClient = createClient<PublicPaths>({ ...options, baseUrl: root, headers })
    keyClient.use(prefix)
    return keyClient
  }

  // A token is fetched per request, so it cannot be baked into the client's
  // default headers the way a key can — middleware is the only place that runs
  // late enough to see an expiry that happened after construction.
  const client = createClient<PublicPaths>({ ...options, baseUrl: root, headers: extra })
  const getAccessToken = opts.getAccessToken
  const auth: Middleware = {
    async onRequest({ request }) {
      request.headers.set('Authorization', `Bearer ${await getAccessToken()}`)
      return request
    },
  }
  // Auth first: the prefix rebuilds the Request around a new URL, and a
  // Request built from another copies its headers, so the token survives.
  client.use(auth)
  client.use(prefix)
  return client
}

export interface ClientCredentialsOptions {
  /** The IdP's token endpoint, from its discovery document. */
  tokenUrl: string
  clientId: string
  clientSecret: string
  /** The API identifier the operator registered as the issuer's audience. */
  audience?: string
  /** Space-delimited scopes to request, when the IdP expects them. */
  scope?: string
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

interface TokenResponse {
  access_token?: unknown
  expires_in?: unknown
}

/**
 * A `getAccessToken` for the `client_credentials` grant, with caching.
 *
 * Reuses the token until a minute before it expires, so a busy client does not
 * hit the IdP's token endpoint on every call — and concurrent callers share one
 * in-flight request rather than starting a stampede of their own.
 *
 * Deliberately small. Anything more (retries, backoff, DPoP) belongs to a real
 * OAuth library; this exists so the common case does not require one.
 */
export function clientCredentialsTokenSource(
  opts: ClientCredentialsOptions,
): () => Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch
  /** Refresh this long before `exp`, so a token cannot expire in flight. */
  const SKEW_MS = 60_000

  let cached: { token: string; expiresAt: number } | null = null
  let inFlight: Promise<string> | null = null

  async function request(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    })
    if (opts.audience) body.set('audience', opts.audience)
    if (opts.scope) body.set('scope', opts.scope)

    const res = await doFetch(opts.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      // The body of a failed token request routinely echoes the client secret
      // back in an error description, so it is not included here.
      throw new Error(`Token request to ${opts.tokenUrl} failed with ${res.status}.`)
    }
    const json = (await res.json()) as TokenResponse
    if (typeof json.access_token !== 'string' || json.access_token.length === 0) {
      throw new Error(`Token endpoint ${opts.tokenUrl} returned no access_token.`)
    }
    const lifetimeS = typeof json.expires_in === 'number' ? json.expires_in : 300
    cached = {
      token: json.access_token,
      expiresAt: Date.now() + Math.max(0, lifetimeS * 1000 - SKEW_MS),
    }
    return cached.token
  }

  return async function getAccessToken(): Promise<string> {
    if (cached && Date.now() < cached.expiresAt) return cached.token
    // One request, however many callers arrive while it is open.
    inFlight ??= request().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
