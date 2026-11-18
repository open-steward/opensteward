/**
 * `client` — thin wrapper around `openapi-fetch` that hands the
 * dispatcher a typed HTTP client wired to either the admin-api spec
 * or the public spec, with the resolved auth context applied as
 * default headers.
 *
 * The CLI deliberately does not depend on `@opensteward/sdk`; it uses
 * `openapi-fetch` directly with the same generated-types pattern so it
 * ships standalone.
 */

import createClient, { type Client } from 'openapi-fetch'
import type { ResolvedAuth } from './auth.js'

export type SpecKind = 'admin' | 'public'

export interface OsClient {
  /** Loose-typed fetcher — generated CLI commands don't have per-route
   *  types at this layer; they pass `{ params, body }` and we forward. */
  request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    init?: {
      params?: { path?: Record<string, unknown>; query?: Record<string, unknown> }
      body?: unknown
    },
  ): Promise<{ data?: T; error?: unknown; response: Response }>
}

/** Three dot-separated base64url segments — an `osk_`/`eut_` key never is. */
function looksLikeJwt(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p))
}

function authHeaders(spec: SpecKind, auth: ResolvedAuth): Record<string, string> {
  if (!auth.token) return {}
  // Admin-api expects a JWT (`Authorization: Bearer <jwt>`). The public
  // API accepts an `osk_` key as either a Bearer token or `X-Api-Key`
  // — both are sent so either server configuration works.
  //
  // Not for an OIDC bearer token, though. `X-Api-Key` means "this is an
  // `osk_` key", and copying a JWT into it would hand the same credential to
  // a header no OIDC deployment reads — widening where the token travels for
  // no benefit. Bearer alone is the whole contract for that credential.
  if (spec === 'public' && !looksLikeJwt(auth.token)) {
    return {
      Authorization: `Bearer ${auth.token}`,
      'X-Api-Key': auth.token,
    }
  }
  return { Authorization: `Bearer ${auth.token}` }
}

export function makeClient(spec: SpecKind, auth: ResolvedAuth): OsClient {
  // We bypass openapi-fetch's per-spec generic types here because the
  // dispatcher routes a runtime-discovered op rather than a compile-
  // time-known path. The SDK is where the strict per-route types live
  // — this client is the CLI's runtime transport.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: Client<any> = createClient<any>({
    baseUrl: auth.baseUrl,
    headers: { 'content-type': 'application/json', ...authHeaders(spec, auth) },
  })
  return {
    async request(method, path, init) {
      const opts: Record<string, unknown> = {}
      if (init?.params) opts.params = init.params
      if (init?.body != null) opts.body = init.body
      // The client sets a default `content-type: application/json` header
      // (see below). A write with no body would then send that header with
      // an empty payload, which Fastify rejects with 400 "Body cannot be
      // empty when content-type is set to 'application/json'". Send `{}` so
      // a valid JSON body matches the header — harmless for the bodyless
      // routes (disable, sync-job cancel, …). admin-api's own clients send
      // `{}` for bodyless writes for the same reason.
      else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        opts.body = {}
      }
      switch (method) {
        case 'GET':
          return base.GET(path as never, opts as never) as never
        case 'POST':
          return base.POST(path as never, opts as never) as never
        case 'PUT':
          return base.PUT(path as never, opts as never) as never
        case 'PATCH':
          return base.PATCH(path as never, opts as never) as never
        case 'DELETE':
          return base.DELETE(path as never, opts as never) as never
        default:
          throw new Error(`unsupported method: ${method}`)
      }
    },
  }
}
