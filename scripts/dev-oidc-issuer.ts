#!/usr/bin/env tsx
/**
 * A stand-in identity provider for a developer machine, with both halves a
 * real IdP has:
 *
 *   1. **Bearer tokens for the developer API** — `client_credentials` at
 *      `/token`, minting LIVE-mode tokens: register it on /oauth-clients like
 *      any IdP and its tokens work on `/v1/*`. (For `/test/v1/*` you want
 *      the built-in `/test/oidc` issuer instead — no separate process.)
 *
 *   2. **SSO sign-in for the admin UI** — authorization code + PKCE at
 *      `/authorize` (a persona picker stands in for the IdP's login page),
 *      `/token` and `/userinfo`. Register it on /identity-providers and
 *      "Sign in with …" appears on the admin login page. Personas carry a
 *      `groups` claim so role-mapping rules can be rehearsed too.
 *
 * Both share one key, discovery document and JWKS (`mock-oidc-issuer.ts`,
 * `mock-oidc-login.ts` in shared).
 *
 *   pnpm dev:oidc-issuer --port 9400
 *
 * Minting is deliberately unauthenticated for (1), and (2) has no passwords —
 * this is a local dev tool whose tokens only mean something to a deployment
 * that chose to trust it. It binds to loopback for that reason.
 *
 * Running the platform in compose? Use the `sso-dev` profile instead of
 * running this on the host: `docker compose --profile sso-dev up -d` starts
 * this script in a container (scripts/dev-oidc-issuer.Dockerfile) published
 * on the host's loopback, plus a bridge that makes admin-api's own
 * localhost:9400 reach it — admin-api only accepts a plain-http issuer on
 * loopback — so `http://localhost:9400` is the issuer for the browser and
 * for admin-api alike. Off by default.
 *
 *   curl -X POST http://localhost:9400/token \
 *     -d grant_type=client_credentials -d client_id=billing-service \
 *     -d scope='customers:read vertical:payments' -d tenant=acme
 */
import { createServer } from 'node:http'
import {
  createMockIssuerKeys,
  discoveryDocument,
  jwksDocument,
  mintMockToken,
} from '../packages/shared/src/auth/mock-oidc-issuer'
import {
  createMockOidcLogin,
  readNodeRequest,
  writeNodeResponse,
} from '../packages/shared/src/auth/mock-oidc-login'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

const port = Number(arg('port', '9400'))
const host = arg('host', '127.0.0.1')
const audience = arg('audience', 'https://opensteward.local')
// `localhost`, not the bind address: the issuer string must be the one the
// browser and admin-api both use, and inside compose that is localhost via
// the sso-dev bridge. Override with --issuer when the deployment differs.
const issuer = arg('issuer', `http://localhost:${port}`)
const clientId = arg('client-id', 'opensteward-admin')
const clientSecret = arg('client-secret', 'dev-secret')

async function main(): Promise<void> {
  const keys = await createMockIssuerKeys('dev-1')
  const login = createMockOidcLogin({ issuer, keys, clientId, clientSecret })
  const bearer = discoveryDocument(issuer)
  const discovery = {
    ...bearer,
    ...login.discovery(),
    grant_types_supported: ['authorization_code', 'client_credentials'],
    response_types_supported: ['code', 'token'],
  }

  const server = createServer(async (nodeReq, res) => {
    const req = await readNodeRequest(nodeReq)
    const url = new URL(req.url, issuer)
    const json = (status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        return json(200, discovery)
      }
      if (req.method === 'GET' && url.pathname === '/jwks') {
        return json(200, jwksDocument(keys))
      }

      // The login half: /authorize, /userinfo, and /token for authorization_code.
      const handled = await login.handle(req)
      if (handled) {
        if (handled.status === 302 && url.pathname === '/authorize') {
          console.log(
            `signed in as ${new URLSearchParams(req.body).get('persona') ?? url.searchParams.get('login_hint')} for ${clientId}`,
          )
        }
        return writeNodeResponse(res, handled)
      }

      if (req.method === 'POST' && url.pathname === '/token') {
        const body = parseBody(req.headers['content-type'], req.body ?? '')
        if (body['grant_type'] !== 'client_credentials') {
          return json(400, {
            error: 'unsupported_grant_type',
            error_description: 'Only authorization_code and client_credentials are supported.',
          })
        }
        const subject = (body['client_id'] ?? '').trim()
        if (!subject) {
          return json(401, { error: 'invalid_client', error_description: 'client_id is required.' })
        }
        const scope = (body['scope'] ?? '').split(/\s+/).filter(Boolean)
        const minted = await mintMockToken(keys, {
          issuer,
          audience: body['audience'] || audience,
          subject,
          scope,
          tenant: body['tenant'] || null,
          tenantClaim: body['tenant_claim'] || 'tenant',
          mode: 'live',
          expiresInS: Number(body['expires_in'] || 3600),
        })
        console.log(`minted ${subject} scope=[${minted.scope}] tenant=${body['tenant'] ?? '-'}`)
        return json(200, {
          access_token: minted.token,
          token_type: 'Bearer',
          expires_in: minted.expiresIn,
          scope: minted.scope,
        })
      }
      json(404, { error: 'not_found' })
    } catch (err) {
      json(500, { error: 'server_error', error_description: String(err) })
    }
  })

  await new Promise<void>((resolve) => server.listen(port, host, resolve))
  const personas = login.personas
    .map(
      (p) =>
        `    ${p.id.padEnd(8)} ${p.email.padEnd(22)} groups: ${p.groups.join(', ') || '(none)'}`,
    )
    .join('\n')
  console.log(`dev OIDC issuer listening on ${host}:${port} as ${issuer}

── Admin SSO (register on /identity-providers/new, protocol OpenID Connect) ──
  Issuer URL      ${issuer}
  Client ID       ${clientId}
  Client secret   ${clientSecret}
  Scopes          openid profile email
  Groups claim    groups
  Role mapping    groups contains ost-admins → admin, ost-operators → operator
  Personas (the picker offers these; login_hint=<id> skips it):
${personas}
  Running admin-api in compose? Also: docker compose --profile sso-dev up -d

── Developer API (register on /oauth-clients/new, preset Generic OIDC) ──
  Issuer URL      ${issuer}
  JWKS URI        ${issuer}/jwks        (the Test button fills this from discovery)
  Audience        ${audience}
  Subject claim   sub
  Scope claim     scope
  Tenant claim    tenant                (token-decides mode only)
  integration-server needs OST_ALLOW_PRIVATE_HOSTS=1 (plain-http issuer) and
  auth.dev_oauth_enabled on. Register a service account for a subject, then:

  curl -s -X POST ${issuer}/token -d grant_type=client_credentials \\
    -d client_id=billing-service -d scope='customers:read' | jq -r .access_token
`)
}

function parseBody(contentType: string | undefined, raw: string): Record<string, string> {
  if ((contentType ?? '').includes('application/json')) {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
