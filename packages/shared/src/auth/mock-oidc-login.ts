/**
 * A mock OpenID Provider for the LOGIN flow — authorization code + PKCE —
 * so the admin UI's SSO sign-in can be rehearsed end to end on a developer
 * machine, or in a test, without Okta, Entra or Keycloak.
 *
 * `mock-oidc-issuer.ts` next door mints bearer tokens for the developer API
 * (`client_credentials`, no browser). This module is the other half a real
 * IdP has: `/authorize` with a persona picker standing in for the IdP's own
 * login page, `/token` exchanging the code, and `/userinfo`. It signs with
 * the same key type, so one JWKS serves both.
 *
 * Framework-agnostic on purpose: `handle()` takes a plain request shape and
 * returns a plain response, or `null` for anything it does not own, so the
 * dev script hosts it on `node:http` and a test can call it directly.
 * `readNodeRequest` / `writeNodeResponse` bridge to `node:http` for the
 * former. In-memory only; nothing here survives a restart.
 *
 * Dev tool, deliberately permissive where a real IdP is not: any
 * `redirect_uri` is accepted, and `login_hint=<persona>` skips the picker so
 * curl and tests can drive it. Bind it to loopback.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { MOCK_ALG, type MockIssuerKeys } from './mock-oidc-issuer'

export interface MockPersona {
  /** Lands in `sub`, and is what `login_hint` names. */
  id: string
  email: string
  name: string
  /** The `groups` claim — what role-mapping rules read. */
  groups: readonly string[]
  /** The `email_verified` claim. Default true. */
  emailVerified?: boolean
  /** The `picture` claim (a URL); omitted when unset. */
  picture?: string
}

/**
 * Three people an operator can sign in as, one per role a mapping rule
 * usually targets. The group names are suggestions for the rules, nothing
 * else reads them.
 */
export const DEFAULT_PERSONAS: readonly MockPersona[] = [
  { id: 'alice', email: 'alice@example.test', name: 'Alice Admin', groups: ['ost-admins'] },
  { id: 'bob', email: 'bob@example.test', name: 'Bob Operator', groups: ['ost-operators'] },
  { id: 'carol', email: 'carol@example.test', name: 'Carol Viewer', groups: [] },
]

export interface MockHttpRequest {
  method: string
  /** Path plus query, e.g. `/authorize?client_id=…`. */
  url: string
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>
  /** Raw body, for POSTs. Form-encoded or JSON. */
  body?: string
}

export interface MockHttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface MockOidcLoginOptions {
  /** Must equal what the relying party registers — goes into `iss`. */
  issuer: string
  keys: MockIssuerKeys
  /** The one client this provider knows; `aud` of every id_token. */
  clientId: string
  /** When set, `/token` requires it (Basic or in the body). */
  clientSecret?: string
  personas?: readonly MockPersona[]
  /** Seconds a code stays exchangeable. Default 300. */
  codeTtlS?: number
  /** Seconds the id_token and access_token live. Default 3600. */
  tokenTtlS?: number
}

export interface MockOidcLogin {
  personas: readonly MockPersona[]
  /** Discovery-document fields for the code flow. Merge over the bearer-token ones. */
  discovery(): Record<string, unknown>
  /**
   * Serve `/authorize`, `/token` (authorization_code only) and `/userinfo`.
   * `null` means "not mine": another path, or a `/token` grant this module
   * does not handle, which the caller may.
   */
  handle(req: MockHttpRequest): Promise<MockHttpResponse | null>
}

interface IssuedCode {
  personaId: string
  redirectUri: string
  scope: string
  nonce: string | null
  codeChallenge: string | null
  codeChallengeMethod: string
  expiresAt: number
  used: boolean
}

interface IssuedAccessToken {
  personaId: string
  expiresAt: number
}

export function createMockOidcLogin(opts: MockOidcLoginOptions): MockOidcLogin {
  const issuer = opts.issuer.replace(/\/$/, '')
  const personas = opts.personas ?? DEFAULT_PERSONAS
  const codeTtlMs = (opts.codeTtlS ?? 300) * 1000
  const tokenTtlS = opts.tokenTtlS ?? 3600
  const codes = new Map<string, IssuedCode>()
  const accessTokens = new Map<string, IssuedAccessToken>()

  const personaById = (id: string | null | undefined): MockPersona | undefined =>
    id ? personas.find((p) => p.id === id) : undefined

  function issueCode(params: URLSearchParams, persona: MockPersona): MockHttpResponse {
    const redirectUri = params.get('redirect_uri') ?? ''
    const code = randomBytes(24).toString('base64url')
    codes.set(code, {
      personaId: persona.id,
      redirectUri,
      scope: params.get('scope') ?? 'openid',
      nonce: params.get('nonce'),
      codeChallenge: params.get('code_challenge'),
      codeChallengeMethod: params.get('code_challenge_method') ?? 'plain',
      expiresAt: Date.now() + codeTtlMs,
      used: false,
    })
    const location = new URL(redirectUri)
    location.searchParams.set('code', code)
    const state = params.get('state')
    if (state !== null) location.searchParams.set('state', state)
    return { status: 302, headers: { location: location.href }, body: '' }
  }

  function authorize(params: URLSearchParams, personaId: string | null): MockHttpResponse {
    if (params.get('client_id') !== opts.clientId) {
      return json(400, {
        error: 'invalid_client',
        error_description: `Unknown client_id; this provider knows "${opts.clientId}".`,
      })
    }
    const redirectUri = params.get('redirect_uri')
    if (!redirectUri || !/^https?:\/\//.test(redirectUri)) {
      return json(400, {
        error: 'invalid_request',
        error_description: 'redirect_uri must be an absolute http(s) URL.',
      })
    }
    if (params.get('response_type') !== 'code' && params.has('response_type')) {
      const back = new URL(redirectUri)
      back.searchParams.set('error', 'unsupported_response_type')
      const state = params.get('state')
      if (state !== null) back.searchParams.set('state', state)
      return { status: 302, headers: { location: back.href }, body: '' }
    }
    const persona = personaById(personaId)
    if (persona) return issueCode(params, persona)
    return html(200, pickerPage(personas, params, personaId))
  }

  async function token(req: MockHttpRequest): Promise<MockHttpResponse | null> {
    const body = parseBody(req)
    if (body.get('grant_type') !== 'authorization_code') return null

    const client = clientCredentials(req, body)
    if (client.id !== opts.clientId || !secretMatches(opts.clientSecret, client.secret)) {
      return json(
        401,
        { error: 'invalid_client', error_description: 'Client authentication failed.' },
        { 'www-authenticate': 'Basic realm="mock-oidc"' },
      )
    }

    const code = body.get('code') ?? ''
    const issued = codes.get(code)
    if (!issued || issued.used || issued.expiresAt < Date.now()) {
      return json(400, {
        error: 'invalid_grant',
        error_description: 'Authorization code is unknown, used or expired.',
      })
    }
    if ((body.get('redirect_uri') ?? issued.redirectUri) !== issued.redirectUri) {
      return json(400, {
        error: 'invalid_grant',
        error_description: 'redirect_uri does not match the authorization request.',
      })
    }
    if (issued.codeChallenge) {
      const verifier = body.get('code_verifier') ?? ''
      const expected =
        issued.codeChallengeMethod === 'S256'
          ? createHash('sha256').update(verifier).digest('base64url')
          : verifier
      if (!verifier || expected !== issued.codeChallenge) {
        return json(400, {
          error: 'invalid_grant',
          error_description: 'PKCE code_verifier does not match.',
        })
      }
    }
    issued.used = true

    const persona = personaById(issued.personaId)!
    const accessToken = randomBytes(24).toString('base64url')
    accessTokens.set(accessToken, {
      personaId: persona.id,
      expiresAt: Date.now() + tokenTtlS * 1000,
    })

    const { SignJWT } = await import('jose')
    const idToken = await new SignJWT({
      ...userinfoClaims(persona),
      ...(issued.nonce ? { nonce: issued.nonce } : {}),
      auth_time: Math.floor(Date.now() / 1000),
    })
      .setProtectedHeader({ alg: MOCK_ALG, kid: opts.keys.kid })
      .setIssuer(issuer)
      .setAudience(opts.clientId)
      .setSubject(persona.id)
      .setIssuedAt()
      .setExpirationTime(`${tokenTtlS}s`)
      .sign(opts.keys.privateKey)

    return json(200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: tokenTtlS,
      id_token: idToken,
      scope: issued.scope,
    })
  }

  function userinfo(req: MockHttpRequest): MockHttpResponse {
    const header = req.headers['authorization'] ?? ''
    const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
    const issued = bearer ? accessTokens.get(bearer) : undefined
    if (!issued || issued.expiresAt < Date.now()) {
      return json(
        401,
        { error: 'invalid_token' },
        { 'www-authenticate': 'Bearer error="invalid_token"' },
      )
    }
    return json(200, userinfoClaims(personaById(issued.personaId)!))
  }

  return {
    personas,
    discovery: () => ({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: [MOCK_ALG],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['openid', 'profile', 'email', 'groups'],
      claims_supported: [
        'sub',
        'email',
        'email_verified',
        'name',
        'preferred_username',
        'groups',
        'picture',
      ],
    }),
    async handle(req) {
      const url = new URL(req.url, issuer)
      const method = req.method.toUpperCase()
      if (url.pathname === '/authorize' && method === 'GET') {
        return authorize(url.searchParams, url.searchParams.get('login_hint'))
      }
      if (url.pathname === '/authorize' && method === 'POST') {
        const body = parseBody(req)
        return authorize(body, body.get('persona'))
      }
      if (url.pathname === '/token' && method === 'POST') return token(req)
      if (url.pathname === '/userinfo' && (method === 'GET' || method === 'POST'))
        return userinfo(req)
      return null
    },
  }
}

function userinfoClaims(persona: MockPersona): Record<string, unknown> {
  return {
    sub: persona.id,
    email: persona.email,
    email_verified: persona.emailVerified ?? true,
    name: persona.name,
    preferred_username: persona.id,
    groups: [...persona.groups],
    ...(persona.picture ? { picture: persona.picture } : {}),
  }
}

function parseBody(req: MockHttpRequest): URLSearchParams {
  const raw = req.body ?? ''
  if ((req.headers['content-type'] ?? '').includes('application/json')) {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return new URLSearchParams(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
  }
  return new URLSearchParams(raw)
}

function clientCredentials(
  req: MockHttpRequest,
  body: URLSearchParams,
): { id: string; secret: string } {
  const basic = /^Basic\s+(.+)$/i.exec(req.headers['authorization'] ?? '')?.[1]
  if (basic) {
    const decoded = Buffer.from(basic, 'base64').toString('utf8')
    const at = decoded.indexOf(':')
    return {
      id: decodeURIComponent(at < 0 ? decoded : decoded.slice(0, at)),
      secret: at < 0 ? '' : decodeURIComponent(decoded.slice(at + 1)),
    }
  }
  return { id: body.get('client_id') ?? '', secret: body.get('client_secret') ?? '' }
}

function secretMatches(expected: string | undefined, presented: string): boolean {
  if (expected === undefined) return true
  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  return a.length === b.length && timingSafeEqual(a, b)
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): MockHttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
    body: JSON.stringify(body),
  }
}

function html(status: number, body: string): MockHttpResponse {
  return {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    body,
  }
}

const FORWARDED = [
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
  'response_type',
]

function pickerPage(
  personas: readonly MockPersona[],
  params: URLSearchParams,
  unknownHint: string | null,
): string {
  const hidden = FORWARDED.filter((k) => params.has(k))
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params.get(k)!)}">`)
    .join('\n      ')
  const options = personas
    .map(
      (p, i) => `<label class="p">
        <input type="radio" name="persona" value="${escapeHtml(p.id)}"${i === 0 ? ' checked' : ''}>
        <b>${escapeHtml(p.name)}</b> <code>${escapeHtml(p.id)}</code><br>
        <small>${escapeHtml(p.email)} · groups: ${p.groups.length ? p.groups.map(escapeHtml).join(', ') : '<i>none</i>'}</small>
      </label>`,
    )
    .join('\n      ')
  const warn = unknownHint
    ? `<p class="warn">No persona named <code>${escapeHtml(unknownHint)}</code>; pick one below.</p>`
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mock IdP — sign in</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}
  h1{font-size:1.25rem} .p{display:block;padding:.75rem;border:1px solid #ccc;border-radius:.5rem;margin:.5rem 0;cursor:pointer}
  .p:has(:checked){border-color:#3b6;background:#f3fbf5} code{background:#eee;padding:0 .25rem;border-radius:.25rem}
  button{font:inherit;padding:.6rem 1.2rem;border-radius:.5rem;border:0;background:#2a5;color:#fff;cursor:pointer}
  .warn{color:#a40} small{color:#555}
</style></head><body>
  <h1>Mock identity provider</h1>
  <p>Sign in to <code>${escapeHtml(params.get('client_id') ?? '')}</code> as:</p>
  ${warn}
  <form method="post" action="/authorize">
      ${hidden}
      ${options}
    <button type="submit">Continue</button>
  </form>
</body></html>
`
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

/** Read a `node:http` request into the shape `handle()` takes. */
export async function readNodeRequest(req: IncomingMessage): Promise<MockHttpRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const headers: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(', ') : v
  return {
    method: req.method ?? 'GET',
    url: req.url ?? '/',
    headers,
    body: Buffer.concat(chunks).toString('utf8'),
  }
}

/** Write a `handle()` response to a `node:http` response. */
export function writeNodeResponse(res: ServerResponse, out: MockHttpResponse): void {
  res.statusCode = out.status
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
  res.end(out.body)
}
