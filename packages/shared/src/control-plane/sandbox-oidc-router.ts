/**
 * The sandbox test issuer: `/test/oidc/*`.
 *
 * The OIDC counterpart of `osk_test_` keys. A deployment mints these tokens
 * itself, so a developer can rehearse the bearer-token flow — register the
 * issuer, register service accounts, present a token — before any real
 * identity provider is involved, and an operator can prove the registry /
 * intersect / token-decides configuration does what they think before
 * switching production traffic to it.
 *
 *   GET  /.well-known/openid-configuration   discovery (what the "Test"
 *                                            button on /oauth-clients reads)
 *   GET  /jwks                               the signing key
 *   POST /token                              client_credentials grant
 *
 * The token endpoint is authenticated the way a real IdP authenticates a
 * client: `client_id` names the subject, `client_secret` is a **test API
 * key**. That is what makes the mock safe to expose — nobody mints a token
 * for a tenant they cannot already reach with a key — and it is why the
 * tenant claim is pinned to the key's tenant rather than taken from the
 * request. Whether the subject is *admitted* is then the registered issuer's
 * decision, exactly as it would be for a production IdP: unregistered
 * subjects are refused in registry mode, and the tenant claim is checked
 * against the allow-list in token-decides mode.
 *
 * Every token carries `ost_mode: 'test'`. `/v1/*` refuses it with
 * KEY_MODE_MISMATCH, as it refuses a test key; only `/test/v1/*` accepts it.
 *
 * Leaf imports only — this router sits in the sandbox's import graph and
 * `check:sandbox-egress` proves it network-free.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import type { OAuthClientStore } from '../auth/oauth-clients'
import {
  SANDBOX_ISSUER_PRESET,
  discoveryDocument,
  jwksDocument,
  mintMockToken,
  type MockIssuerKeys,
} from '../auth/mock-oidc-issuer'
import { consume, type RateLimitConfig } from './rate-limit'

export interface SandboxOidcRouterOptions {
  apiKeys: ApiKeyStore
  oauth: OAuthClientStore
  keys: MockIssuerKeys
  /**
   * The issuer URL as this request sees it — `<public base>/test/oidc`. It
   * must equal what the operator registered, byte for byte: it is the `iss`
   * on every token and the key the sandbox looks the issuer row up by.
   */
  issuerUrl: (request: FastifyRequest) => Promise<string> | string
  /** Live read of `features.test_mode_enabled`. Absent = enabled. */
  testModeEnabled?: () => boolean
  /** Per-IP mint budget. Default 60/hour. */
  rateLimit?: RateLimitConfig
}

const DEFAULT_MINT_RATE_LIMIT: RateLimitConfig = { max: 60, windowMs: 3_600_000 }
const DEFAULT_TOKEN_TTL_S = 3600

/** RFC 6749 §5.2 error shape — token clients parse this, not our envelope. */
async function oauthError(
  reply: FastifyReply,
  status: number,
  error: string,
  description: string,
): Promise<void> {
  await reply.status(status).send({ error, error_description: description })
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** `Authorization: Basic base64(client_id:client_secret)` — the other spec'd client auth. */
function parseBasic(request: FastifyRequest): { id: string; secret: string } | null {
  const raw = request.headers['authorization']
  const header = Array.isArray(raw) ? raw[0] : raw
  const match = header ? /^Basic\s+(.+)$/i.exec(header) : null
  if (!match) return null
  try {
    const decoded = Buffer.from(match[1]!, 'base64').toString('utf8')
    const at = decoded.indexOf(':')
    if (at < 0) return null
    return {
      id: decodeURIComponent(decoded.slice(0, at)),
      secret: decodeURIComponent(decoded.slice(at + 1)),
    }
  } catch {
    return null
  }
}

export function createSandboxOidcRouter(opts: SandboxOidcRouterOptions): FastifyPluginAsync {
  const rateLimit = opts.rateLimit ?? DEFAULT_MINT_RATE_LIMIT

  return async (fastify) => {
    // Real client_credentials clients send a form body. integration-server
    // registers no form parser, so this plugin carries its own — scoped to
    // this encapsulation, so nothing else on the server starts accepting
    // forms because of it.
    fastify.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        try {
          done(null, Object.fromEntries(new URLSearchParams(String(body))))
        } catch (err) {
          done(err as Error)
        }
      },
    )

    const testModeGate = async (reply: FastifyReply): Promise<boolean> => {
      if (opts.testModeEnabled && !opts.testModeEnabled()) {
        await reply.status(503).send({
          error: {
            code: 'TEST_MODE_DISABLED',
            message:
              'Test mode is disabled on this deployment. An operator set ' +
              'features.test_mode_enabled = false.',
          },
        })
        return false
      }
      return true
    }

    fastify.get('/.well-known/openid-configuration', async (request, reply) => {
      if (!(await testModeGate(reply))) return
      return discoveryDocument(await opts.issuerUrl(request))
    })

    fastify.get('/jwks', async (_request, reply) => {
      if (!(await testModeGate(reply))) return
      return jwksDocument(opts.keys)
    })

    fastify.post('/token', async (request, reply) => {
      if (!(await testModeGate(reply))) return
      const body = (request.body ?? {}) as Record<string, unknown>
      const basic = parseBasic(request)

      const grantType = str(body['grant_type'])
      if (grantType !== 'client_credentials') {
        return oauthError(
          reply,
          400,
          'unsupported_grant_type',
          'Only grant_type=client_credentials is supported.',
        )
      }
      const clientId = str(body['client_id']) || basic?.id || ''
      const clientSecret = str(body['client_secret']) || basic?.secret || ''
      if (!clientId || !clientSecret) {
        return oauthError(
          reply,
          401,
          'invalid_client',
          'client_id (the subject to mint for) and client_secret (a test API key, osk_test_…) are required.',
        )
      }

      const rl = await consume(`sandbox-oidc:${request.ip}`, rateLimit)
      if (!rl.ok) {
        reply.header('retry-after', String(Math.ceil(rl.retryAfterMs / 1000)))
        return oauthError(reply, 429, 'temporarily_unavailable', 'Token minting is rate-limited.')
      }

      // The test key is the client credential. Its tenant is the tenant the
      // token asserts; nothing in the request can widen that.
      const key = await opts.apiKeys.verify(clientSecret)
      if (!key || key.mode !== 'test') {
        return oauthError(
          reply,
          401,
          'invalid_client',
          'client_secret must be a valid test API key (osk_test_…). A live key is refused here, as a test key is refused on /v1.',
        )
      }

      const issuer = await opts.issuerUrl(request)
      const row = await opts.oauth.getIssuerByIss(issuer)
      if (!row || row.preset !== SANDBOX_ISSUER_PRESET) {
        return oauthError(
          reply,
          400,
          'invalid_request',
          `This deployment's test issuer is not registered. On /oauth-clients/new choose the ` +
            `"OpenSteward test issuer" preset with issuer URL ${issuer}, then register the ` +
            `subject as a service account.`,
        )
      }
      if (!row.enabled) {
        return oauthError(reply, 400, 'invalid_request', 'The test issuer is disabled.')
      }

      const requested = str(body['scope'])
      const scope = requested ? requested.split(/\s+/).filter(Boolean) : key.scopes
      const minted = await mintMockToken(opts.keys, {
        issuer,
        audience: row.audience,
        subject: clientId,
        scope,
        tenant: key.tenantId,
        tenantClaim: row.tenantClaim ?? 'tenant',
        mode: 'test',
        // Token-decides mode enforces the issuer's lifetime cap at verification.
        expiresInS: Math.min(DEFAULT_TOKEN_TTL_S, row.maxTokenLifetimeS),
      })
      return reply.status(200).send({
        access_token: minted.token,
        token_type: 'Bearer',
        expires_in: minted.expiresIn,
        scope: minted.scope,
      })
    })
  }
}
