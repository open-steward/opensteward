/**
 * SSO routes — UNAUTHENTICATED (pre-login). Initiate + callback per protocol,
 * direct LDAP login, and the single-use handoff exchange the admin UI calls
 * server-to-server to obtain the issued JWT.
 *
 * The IdP round-trip terminates HERE (admin-api owns all secrets + the JWT
 * signer); the UI never parses raw assertions. After validation we mint a
 * one-time handoff code and redirect the browser to the UI completion route.
 */
import type { FastifyInstance } from 'fastify'
// Imported for its TS augmentation of FastifyContextConfig['rateLimit'].
// `@fastify/rate-limit` itself is registered globally inside createBaseServer
// — this import only pulls the type declarations into scope.
import '@fastify/rate-limit'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import type { IdentityStore, IdentityProviderRow } from '../db/identity-store'
import { SecretBundleUnreadableError } from '../db/identity-store'
import type { Config } from '../../config'
import { beginOidcLogin, completeOidcLogin } from '../auth/idp/oidc-provider'
import { beginSamlLogin, completeSamlLogin } from '../auth/idp/saml-provider'
import { ldapAuthenticate, LdapAuthError } from '../auth/idp/ldap-provider'
import { provisionAndMap, JitDisabledError } from '../auth/idp/jit-provisioning'
import { IdpProfileSync } from '../auth/idp/profile-sync'
import { issueHandoff } from '../auth/idp/issue-token'
import { sanitizeReturnTo } from '../auth/idp/return-to'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import { AuthTokenResponse, LoginOptions, dataEnvelope, errorBody } from './_openapi'

const TAG = 'sso'

const RATE = { rateLimit: { max: 10, timeWindow: 60_000 } }

const SlugParam = z.object({ slug: z.string() })

const InitiateQuery = z.object({ return_to: z.string().optional() })
const CallbackQuery = z.object({ state: z.string().optional() })

const SamlAcsBody = z.object({
  SAMLResponse: z.string().optional().meta({ description: 'Base64-encoded SAML response POSTed by the IdP to the Assertion Consumer Service.', example: 'PHNhbWxwOlJlc3BvbnNlIC4uLj48L3NhbWxwOlJlc3BvbnNlPg==' }),
  RelayState: z.string().optional().meta({ description: 'Opaque relay state echoed back by the IdP, typically the post-login return path.', example: '/dashboard' }),
}).meta({ id: 'SamlAcsBody', description: 'Form body the IdP POSTs to the SAML Assertion Consumer Service endpoint.' })

const LdapLoginBody = z.object({
  username: z.string().optional().meta({ description: 'LDAP username to authenticate.', example: 'olivia.admin' }),
  password: z.string().optional().meta({ description: "The user's LDAP password.", example: 's3cr3t-password' }),
}).meta({ id: 'LdapLoginBody', description: 'Credentials submitted to authenticate against an LDAP identity provider.' })

const HandoffBody = z.object({ code: z.string().optional().meta({ description: 'One-time handoff code exchanged for a session token after SSO completes.', example: 'sso_8f3a2b9c4d5e6f7a' }) }).meta({ id: 'SsoHandoffBody', description: 'Body carrying the one-time SSO handoff code to exchange for a bearer token.' })

const Redirect = z.string()

export interface SsoRoutesOptions {
  /** Copies the IdP's email and picture onto the user at sign-in. Built
   *  here when absent; server.ts shares one with the SCIM routes. */
  profileSync?: IdpProfileSync
}

export function createSsoRoutes(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  config: Config,
  runtimeSettings: RuntimeSettingsStore,
  opts: SsoRoutesOptions = {},
) {
  return async function ssoRoutes(fastify: FastifyInstance): Promise<void> {
    const callbackUrl = (slug: string) => `${config.sso.publicBaseUrl.replace(/\/$/, '')}/api/sso/${slug}/callback`
    const acsUrl = (slug: string) => `${config.sso.publicBaseUrl.replace(/\/$/, '')}/api/sso/${slug}/acs`
    const profileSync = opts.profileSync ?? new IdpProfileSync(adminStore, { logger: fastify.log })

    function completeUiRedirect(code: string, returnTo: string): string {
      const base = config.sso.adminUiUrl.replace(/\/$/, '')
      const params = new URLSearchParams({ code, return_to: returnTo })
      return `${base}/login/sso/complete?${params.toString()}`
    }

    async function finishLogin(provider: IdentityProviderRow, identity: Awaited<ReturnType<typeof completeOidcLogin>>, returnTo: string, reply: import('fastify').FastifyReply) {
      const result = await provisionAndMap(adminStore, identityStore, provider, identity)
      // Email now, picture in the background; never fails the sign-in.
      await profileSync.apply(result.user.id, identity)
      await adminStore.writeAudit(result.user.id, 'sso.login', undefined, provider.id, {
        created: result.created,
        roleChanged: result.roleChanged,
        role: result.user.role,
      })
      const code = await issueHandoff(identityStore, (p) => fastify.jwt.sign(p), result.user)
      return reply.redirect(completeUiRedirect(code, returnTo))
    }

    // Public login options for the login page (no secrets): enabled providers
    // plus whether the local password form should be shown.
    fastify.get(
      '/api/sso/login-options',
      {
        schema: {
          tags: [TAG],
          summary: 'Public list of enabled SSO providers + local-login flag',
          description:
            'Public, **unauthenticated** endpoint that returns the enabled SSO providers (no secrets) and whether the local password form should be shown. Consumed by the login page to render its sign-in options.',
          operationId: 'sso.login-options',
          response: {
            200: dataEnvelope(LoginOptions),
          },
          security: [],
        },
      },
      async () => {
        const [providers, localLoginSetting] = await Promise.all([
          identityStore.listEnabledPublic(),
          runtimeSettings.get('auth.local_login_enabled'),
        ])
        return {
          data: {
            providers,
            localLoginEnabled: localLoginSetting?.value !== false,
          },
        }
      },
    )

    // ── Initiation (OIDC + SAML; LDAP has no redirect) ──
    fastify.get<{ Params: { slug: string }; Querystring: { return_to?: string } }>(
      '/api/sso/:slug/login',
      {
        config: RATE,
        schema: {
          tags: [TAG],
          summary: 'Begin an OIDC / SAML login redirect',
          description:
            'Begin an SSO login by redirecting (`302`) to the OIDC or SAML provider identified by `slug`; an optional `return_to` is preserved through the round-trip. Unauthenticated and rate-limited (10/min). Returns `404` if the provider is unknown or disabled, `400` if it does not support redirect login (e.g. LDAP), and `502` if initiation fails.',
          operationId: 'sso.login',
          params: SlugParam,
          querystring: InitiateQuery,
          response: {
            302: Redirect,
            400: errorBody,
            404: errorBody,
            502: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        const provider = await identityStore.getProviderBySlug(request.params.slug)
        if (!provider || !provider.enabled) return reply.status(404).send({ error: 'Unknown provider' })
        const returnTo = sanitizeReturnTo(request.query.return_to)
        try {
          if (provider.protocol === 'oidc') {
            const secret = await identityStore.getSecretBundle(provider.id)
            const url = await beginOidcLogin(
              identityStore,
              provider,
              secret.clientSecret ?? '',
              callbackUrl(provider.slug),
              returnTo,
            )
            return reply.redirect(url)
          }
          if (provider.protocol === 'saml') {
            const secret = await identityStore.getSecretBundle(provider.id)
            if (!secret.idpCert) return reply.status(500).send({ error: 'SAML provider missing IdP certificate' })
            // RelayState carries our return_to round-trip for SAML. When an SP
            // private key is configured the AuthnRequest is signed.
            const url = await beginSamlLogin(
              identityStore,
              provider,
              secret.idpCert,
              acsUrl(provider.slug),
              returnTo,
              { spPrivateKey: secret.spPrivateKey, spCertificate: secret.spCertificate },
            )
            return reply.redirect(url)
          }
          return reply.status(400).send({ error: 'Provider does not support redirect login' })
        } catch (err) {
          if (err instanceof SecretBundleUnreadableError) {
            return reportUnreadableSecrets(err, request, reply)
          }
          request.log.error({ err }, 'sso initiation failed')
          return reply.status(502).send({ error: 'Failed to start SSO login' })
        }
      },
    )

    // ── OIDC callback ──
    fastify.get<{ Params: { slug: string }; Querystring: { state?: string } }>(
      '/api/sso/:slug/callback',
      {
        config: RATE,
        schema: {
          tags: [TAG],
          summary: 'OIDC redirect-callback endpoint',
          description:
            'OIDC redirect-callback the provider sends the browser back to after authentication. Unauthenticated and rate-limited (10/min). Validates the `state`, provisions/maps the user, then `302`-redirects to the UI completion route with a one-time handoff code. Returns `400` for missing/invalid/expired state, `404` for an unknown provider, and `401` if authentication fails. Writes an `sso.login` audit entry.',
          operationId: 'sso.callback',
          params: SlugParam,
          querystring: CallbackQuery,
          response: {
            302: Redirect,
            400: errorBody,
            401: errorBody,
            404: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        const provider = await identityStore.getProviderBySlug(request.params.slug)
        if (!provider || provider.protocol !== 'oidc') return reply.status(404).send({ error: 'Unknown provider' })
        const state = request.query.state
        if (!state) return reply.status(400).send({ error: 'Missing state' })
        const txn = await identityStore.consumeTransaction(state)
        if (!txn || txn.providerId !== provider.id) {
          return reply.status(400).send({ error: 'Invalid or expired login state' })
        }
        try {
          const secret = await identityStore.getSecretBundle(provider.id)
          const fullUrl = `${config.sso.publicBaseUrl.replace(/\/$/, '')}${request.url}`
          const identity = await completeOidcLogin(provider, secret.clientSecret ?? '', fullUrl, {
            nonce: txn.nonce,
            codeVerifier: txn.codeVerifier,
            id: txn.id,
          })
          return await finishLogin(provider, identity, txn.returnTo, reply)
        } catch (err) {
          return handleLoginError(err, request, reply)
        }
      },
    )

    // ── SAML ACS (form-encoded POST from the IdP) ──
    fastify.post<{ Params: { slug: string }; Body: { SAMLResponse?: string; RelayState?: string } }>(
      '/api/sso/:slug/acs',
      {
        config: RATE,
        schema: {
          tags: [TAG],
          summary: 'SAML Assertion Consumer Service (form-POST)',
          description:
            'SAML Assertion Consumer Service: the form-encoded `SAMLResponse` the IdP POSTs after authentication. Unauthenticated and rate-limited (10/min). Validates the assertion, provisions/maps the user, then `302`-redirects to the UI completion route with a one-time handoff code. Returns `400` if `SAMLResponse` is missing, `404` for a non-SAML/unknown provider, `500` if the IdP certificate is unconfigured, and `401` on validation failure. Writes an `sso.login` audit entry.',
          operationId: 'sso.acs',
          params: SlugParam,
          body: SamlAcsBody,
          response: {
            302: Redirect,
            400: errorBody,
            401: errorBody,
            404: errorBody,
            500: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        const provider = await identityStore.getProviderBySlug(request.params.slug)
        if (!provider || provider.protocol !== 'saml') return reply.status(404).send({ error: 'Unknown provider' })
        const samlResponse = request.body?.SAMLResponse
        if (!samlResponse) return reply.status(400).send({ error: 'Missing SAMLResponse' })
        const returnTo = sanitizeReturnTo(request.body?.RelayState)
        try {
          const secret = await identityStore.getSecretBundle(provider.id)
          if (!secret.idpCert) return reply.status(500).send({ error: 'SAML provider missing IdP certificate' })
          const identity = await completeSamlLogin(
            identityStore,
            provider,
            secret.idpCert,
            acsUrl(provider.slug),
            samlResponse,
            { spPrivateKey: secret.spPrivateKey, spCertificate: secret.spCertificate },
          )
          return await finishLogin(provider, identity, returnTo, reply)
        } catch (err) {
          return handleLoginError(err, request, reply)
        }
      },
    )

    // ── LDAP direct login (server-to-server from the UI; returns JWT) ──
    fastify.post<{ Params: { slug: string }; Body: { username?: string; password?: string } }>(
      '/api/sso/:slug/ldap-login',
      {
        config: { rateLimit: { max: 5, timeWindow: 60_000 } },
        schema: {
          tags: [TAG],
          summary: 'LDAP direct username/password login → JWT',
          description:
            'Authenticate a username/password directly against an LDAP provider and return a JWT (no browser redirect). Unauthenticated and tightly rate-limited (5/min). Returns `400` if a credential is missing, `404` for an unknown/disabled/non-LDAP provider, `401` on invalid credentials, and `403` if JIT provisioning is disabled for a first-time user. Writes an `sso.login` audit entry.',
          operationId: 'sso.ldap-login',
          params: SlugParam,
          body: LdapLoginBody,
          response: {
            200: AuthTokenResponse,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        const provider = await identityStore.getProviderBySlug(request.params.slug)
        if (!provider || !provider.enabled || provider.protocol !== 'ldap') {
          return reply.status(404).send({ error: 'Unknown provider' })
        }
        const { username, password } = request.body ?? {}
        if (!username || !password) return reply.status(400).send({ error: 'Username and password are required' })
        try {
          const secret = await identityStore.getSecretBundle(provider.id)
          const identity = await ldapAuthenticate(provider, secret.ldapBindPassword ?? '', username, password)
          const result = await provisionAndMap(adminStore, identityStore, provider, identity)
          // The directory's mail attribute; LDAP carries no picture URL.
          await profileSync.apply(result.user.id, identity)
          await adminStore.writeAudit(result.user.id, 'sso.login', undefined, provider.id, {
            protocol: 'ldap',
            created: result.created,
            role: result.user.role,
          })
          const token = fastify.jwt.sign({
            id: result.user.id,
            username: result.user.username,
            role: result.user.role,
          })
          return reply.send({ token, user: result.user })
        } catch (err) {
          if (err instanceof LdapAuthError) return reply.status(401).send({ error: 'Invalid credentials' })
          return handleLoginError(err, request, reply)
        }
      },
    )

    // ── Handoff exchange (UI → admin-api, server-to-server) ──
    fastify.post<{ Body: { code?: string } }>(
      '/api/sso/handoff/exchange',
      {
        config: { rateLimit: { max: 30, timeWindow: 60_000 } },
        schema: {
          tags: [TAG],
          summary: 'Exchange a one-time SSO handoff code for a JWT',
          description:
            'Exchange the one-time handoff code issued at the end of an OIDC/SAML flow for a JWT. Called server-to-server by the admin UI; unauthenticated and rate-limited (30/min). The code is single-use — returns `400` if it is missing, already consumed, or expired.',
          operationId: 'sso.handoff.exchange',
          body: HandoffBody,
          response: {
            200: AuthTokenResponse,
            400: errorBody,
          },
          security: [],
        },
      },
      async (request, reply) => {
        const code = request.body?.code
        if (!code) return reply.status(400).send({ error: 'Missing code' })
        const result = await identityStore.consumeHandoff(code)
        if (!result) return reply.status(400).send({ error: 'Invalid or expired handoff code' })
        return reply.send(result)
      },
    )
  }
}

function handleLoginError(
  err: unknown,
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
) {
  if (err instanceof JitDisabledError) {
    return reply.status(403).send({ error: err.message })
  }
  if (err instanceof SecretBundleUnreadableError) {
    return reportUnreadableSecrets(err, request, reply)
  }
  request.log.error({ err }, 'sso login failed')
  return reply.status(401).send({ error: 'SSO authentication failed' })
}

/**
 * This server cannot read its OWN stored secrets for the provider — nothing
 * the person logging in did or can fix. It must not land in the generic
 * buckets around it: `401 "SSO authentication failed"` blames their password
 * for a STORE_SECRET mismatch, and `502 "Failed to start SSO login"` names no
 * cause at all.
 */
function reportUnreadableSecrets(
  err: SecretBundleUnreadableError,
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
) {
  request.log.error({ err, providerId: err.providerId }, 'sso provider secrets are unreadable')
  return reply.status(500).send({ error: err.message })
}
