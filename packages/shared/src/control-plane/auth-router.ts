/**
 * Unified OAuth router. Handles every vertical's connect/callback flow at
 * vertical-aware paths:
 *
 *   GET    /auth/{vertical}/{platform}/connect     (+ POST for static creds)
 *   GET    /auth/{vertical}/{platform}/callback
 *
 * (Connection deletion is NOT here — it lives at DELETE /admin/connections/{id}
 * for operators and DELETE /v1/connections/{id} for tenant dev keys.)
 *
 * Vertical lives in the URL because two adapters can ship the same slug
 * (e.g. `bexio` exists in both accounting and crm) — the path
 * disambiguates which adapter to hand the OAuth dance to.
 */
import type { FastifyPluginAsync } from 'fastify'
import { CredentialStore, DuplicateLabelError } from '../auth/store'
import { ConnectSessionStore } from '../auth/connect-sessions'
import {
  consumePendingState,
  generatePkcePair,
  generateState,
  redirectUriIn,
  storePendingState,
} from '../auth/oauth'
import { collectOAuthInputs } from '../auth/oauth-inputs'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import type { SyncStore } from '../data-store/sync-store'
import type { SyncSchedule } from '../data-store/sync-schedule'
import { emitTenantEvent } from './event-emitter'
import { resolvePublicBaseUrl, type PublicBaseUrlInputs } from './public-base-url'
import { InvalidRedirectUriError, validateRedirectUri } from './redirect-uri-validator'
import { adminGuard } from './admin-guard'
import { resolveApiKey } from './api-key-middleware'
import { hasScope, type ApiKeyStore } from '../auth/api-keys'
import { unsupportedRefusal, type UnsupportedPlatform } from '../reference/platform-status'
import { isLicenseError, publicRefusalBody } from '../licensing/errors'

export interface UnifiedAuthRouterOptions {
  store: CredentialStore
  registry: UnifiedAdapterRegistry
  /**
   * Optional connect-session store. When provided, OAuth callbacks whose
   * pending state carries a `sessionId` will mark that session consumed
   * and 302-redirect to `/connect/:token/done` (or to the session's
   * `redirect_url` if set) instead of returning 201 JSON.
   */
  connectSessions?: ConnectSessionStore
  /**
   * Optional outbound webhook store. When provided + a connect-link
   * session is consumed, fires `connect_link.consumed` to matching subs.
   */
  webhookSubs?: WebhookSubscriptionStore
  /** Optional. When supplied, the connect_link.consumed delivery is durably queued. */
  webhookDeliveries?: WebhookDeliveryStore
  /**
   * Optional sync store. When provided + a connect-link session is
   * consumed, automatically enqueue a sync job for the new connection so
   * the cache is warm by the time the operator's app reads from it.
   * No-op when the host service runs in `passthrough` mode (server.ts
   * wires this only when mode != passthrough).
   */
  syncStore?: SyncStore
  /**
   * Optional resolver for the operator-set `companyInfo.baseUrl`. When
   * provided, takes precedence over the request's host/protocol but is
   * itself overridden by `PUBLIC_BASE_URL` env. Returning null falls
   * through to the request-derived value.
   */
  getCompanyBaseUrl?: () => Promise<string | null> | string | null
  /**
   * Hosts (in `host:port` form, without scheme) that may appear in a
   * caller-supplied `?redirect_uri=` in addition to the deployment's
   * own origin. The path is always pinned to the standard callback
   * shape regardless. Leave empty for the common case where the OAuth
   * callback lives on the same origin as the start route.
   */
  extraAllowedRedirectHosts?: ReadonlyArray<string>
  /**
   * Developer API keys. When supplied, `POST /auth/{vertical}/{platform}/
   * connect` also accepts a tenant-scoped Bearer key carrying
   * `connections:write` — see the handler for why that is narrower than the
   * admin secret rather than equivalent to it. Omit and the route is
   * admin-secret only.
   */
  apiKeys?: ApiKeyStore
  /**
   * Optional resolver for the "unsupported" platform status (listed but not
   * connectable — see `UnsupportedPlatform` in the reference module). When
   * it returns a value for `(vertical, platform)`, both the GET and POST
   * `/auth/:vertical/:platform/connect` routes refuse with a 400 before
   * resolving the adapter. The OAuth callback never consults this — an
   * authorization already in flight must be allowed to complete.
   */
  getUnsupported?: (
    vertical: string,
    platform: string,
  ) => (UnsupportedPlatform & { name?: string }) | undefined
  /**
   * License (integration-server): throws a LicenseError when a connection for
   * `vertical` may not be created now. Asked before the provider redirect and
   * before a static credential is exchanged, so a refusal comes before the
   * customer's consent, not after it. CredentialStore's create guard stays the
   * authority: a race can still refuse at the callback.
   */
  assertCanCreateConnection?: (vertical: string) => Promise<void>
}

interface ConnectQuery {
  label?: string
  tenant_id?: string
  redirect_uri?: string
  /** Values for the adapter's `oauthFields`, by name — `?shop=acme` for Shopify. */
  [key: string]: string | undefined
}

interface CallbackQuery {
  code?: string
  state?: string
  /** RFC 6749 §4.1.2.1 — set instead of `code` when the customer declined,
   *  or the provider refused. `access_denied` is the cancel button. */
  error?: string
  error_description?: string
}

export function createUnifiedAuthRouter(opts: UnifiedAuthRouterOptions): FastifyPluginAsync {
  const { store, registry, connectSessions, webhookSubs, webhookDeliveries, getCompanyBaseUrl } =
    opts

  async function resolveBase(_request: {
    protocol: string
    hostname: string
  }): Promise<PublicBaseUrlInputs> {
    if (!getCompanyBaseUrl) return {}
    try {
      const companyBaseUrl = await getCompanyBaseUrl()
      return { companyBaseUrl: companyBaseUrl ?? null }
    } catch {
      return {}
    }
  }

  const syncStore = opts.syncStore

  return async (fastify) => {
    fastify.get<{
      Params: { vertical: string; platform: string }
      Querystring: ConnectQuery
    }>('/auth/:vertical/:platform/connect', async (request, reply) => {
      const { vertical, platform } = request.params
      const unsupported = opts.getUnsupported?.(vertical, platform)
      if (unsupported) {
        return reply.status(400).send(unsupportedRefusal(unsupported.name ?? platform, unsupported))
      }
      const adapter = registry.get(vertical, platform)
      if (!adapter) {
        return reply.status(404).send({
          error: {
            code: 'ADAPTER_UNAVAILABLE',
            message: `Adapter '${vertical}:${platform}' is not enabled.`,
          },
        })
      }
      // Same inputs the Connect Link start collects, read from the query string
      // here so the admin path stays usable without a form: `?shop=acme`.
      const { inputs, missing } = collectOAuthInputs(adapter.oauthFields?.(), request.query)
      if (missing.length > 0) {
        return reply.status(400).send({
          error: {
            code: 'MISSING_OAUTH_FIELDS',
            message: `Required before connecting: ${missing.join(', ')}.`,
            fields: missing,
          },
        })
      }
      // License: refuse before the customer is sent to the provider. This route
      // is unauthenticated, so the caller gets the code and a generic message;
      // the limit, count and feature go to the log only (review #6).
      if (opts.assertCanCreateConnection) {
        try {
          await opts.assertCanCreateConnection(vertical)
        } catch (err) {
          if (!isLicenseError(err)) throw err
          request.log.warn(
            { vertical, platform, code: err.code, ...err.details },
            'oauth start refused by the license',
          )
          return reply.status(403).send(publicRefusalBody(err))
        }
      }
      const state = generateState()
      const baseInputs = await resolveBase(request)
      const deploymentOrigin = resolvePublicBaseUrl(request, baseInputs)
      const expectedPath = `/auth/${vertical}/${platform}/callback`

      // Caller may supply ?redirect_uri= to override the default
      // same-origin callback. Validate it against the deployment's
      // origin (+ any operator-extended hosts) and pin the path —
      // otherwise an attacker could route the OAuth `code` to a host
      // they control by tampering with the query string.
      let redirectUri: string
      if (request.query.redirect_uri) {
        try {
          validateRedirectUri(request.query.redirect_uri, {
            deploymentOrigin,
            expectedPath,
            extraAllowedHosts: opts.extraAllowedRedirectHosts,
          })
        } catch (err) {
          if (err instanceof InvalidRedirectUriError) {
            return reply.status(400).send({
              error: { code: 'INVALID_REDIRECT_URI', message: err.reason },
            })
          }
          throw err
        }
        redirectUri = request.query.redirect_uri
      } else {
        redirectUri = `${deploymentOrigin}${expectedPath}`
      }
      // The direct OAuth start, alongside the Connect Link one. Both authorize
      // paths need PKCE or a platform that requires it fails on whichever was
      // missed — and this one is the path the admin UI uses.
      const pkce = adapter.capabilities?.requiresPkce ? generatePkcePair() : undefined
      const url = adapter.getAuthUrl(state, undefined, pkce?.challenge, inputs ?? undefined)
      storePendingState(state, platform, {
        vertical,
        label: request.query.label ?? null,
        tenantId: request.query.tenant_id ?? null,
        // What the provider was actually sent wins: the exchange must replay
        // it exactly, and it comes from the adapter's own Redirect URI, which
        // may sit on another origin (https) than the one derived above. The
        // validated `?redirect_uri=` only survives when the URL carries none.
        redirectUri: redirectUriIn(url) ?? redirectUri,
        codeVerifier: pkce?.verifier ?? null,
        inputs,
      })
      return reply.redirect(url)
    })

    /**
     * Headless connect for adapters that take a static credential.
     *
     * The OAuth GET above cannot serve `api_key` platforms — there is no
     * provider to redirect to — and the Connect Link flow
     * (`POST /connect/sessions/:token/credentials`) needs a hosted page and a
     * one-time session. Server-to-server callers, and any tooling that
     * provisions carriers in bulk, need a flow with neither a browser
     * redirect nor a hosted page — this route provides it.
     *
     * **Two credentials, deliberately unequal.** An unauthenticated route
     * accepting a caller-supplied `tenant_id` would let anyone reachable
     * mint a connection owned by any tenant — that tenant's later reads and
     * writes would then flow through an upstream account the caller
     * controls. So:
     *
     *  - **`X-Admin-Secret`** takes `tenant_id` from the body, so an
     *    operator can provision for any tenant or for none. Same gate
     *    `/connections*` and `/admin/*` use.
     *  - **A tenant Bearer key** with `connections:write` also works, but
     *    `tenant_id` is taken from the KEY and the body's value is ignored.
     *    That is what makes it safe to expose: a tenant can provision its own
     *    carriers headlessly and cannot reach another's.
     *
     * Admin-only would be safe too, but would leave a tenant no way to
     * connect an api_key platform without either an operator or the hosted
     * Connect Link page — a real gap for anyone scripting their own
     * integrations.
     *
     * The presented credential picks the path. A Bearer header means the
     * tenant path even if a secret is also present, so the narrower rule wins
     * rather than the broader one.
     */
    fastify.post<{
      Params: { vertical: string; platform: string }
      Body: {
        api_key?: string
        fields?: Record<string, string>
        tenant_id?: string | null
        label?: string
      }
    }>('/auth/:vertical/:platform/connect', async (request, reply) => {
      const bearer = (request.headers['authorization'] ?? '').toString().startsWith('Bearer ')
      let tenantFromKey: string | null | undefined
      if (bearer && opts.apiKeys) {
        const result = await resolveApiKey(request, reply, opts.apiKeys, 'live')
        if (result === false) return reply
        if (!result) {
          return reply
            .status(401)
            .send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired API key.' } })
        }
        if (!hasScope(result.scopes, 'connections:write')) {
          return reply.status(403).send({
            error: {
              code: 'INSUFFICIENT_SCOPE',
              message: "This API key is missing required scope 'connections:write'.",
              requiredScope: 'connections:write',
            },
          })
        }
        tenantFromKey = result.tenantId
      } else if (!adminGuard(request, reply)) {
        return reply
      }
      const { vertical, platform } = request.params
      const unsupported = opts.getUnsupported?.(vertical, platform)
      if (unsupported) {
        return reply.status(400).send(unsupportedRefusal(unsupported.name ?? platform, unsupported))
      }
      const adapter = registry.get(vertical, platform)
      if (!adapter) {
        return reply.status(404).send({
          error: {
            code: 'ADAPTER_UNAVAILABLE',
            message: `Adapter '${vertical}:${platform}' is not enabled.`,
          },
        })
      }
      // OAuth-only adapters leave both hooks undefined. 404 rather than 400,
      // as documented: from the caller's side this operation does not exist
      // for this platform, and the OAuth GET is where they should go.
      if (typeof adapter.exchangeCredentials !== 'function') {
        return reply.status(404).send({
          error: {
            code: 'ADAPTER_NOT_LINK_READY',
            message: `'${vertical}:${platform}' has no static-credential flow — use GET /auth/${vertical}/${platform}/connect.`,
          },
        })
      }

      const body = request.body ?? {}
      const declared =
        typeof adapter.credentialFields === 'function' ? adapter.credentialFields() : []
      const required = declared.filter((f) => f.required !== false).map((f) => f.name)

      // `fields` is the real contract, because the field NAMES are the
      // adapter's: `clientId`/`clientSecret` for one, a single named token for
      // another. `api_key` is the shorthand shape the spec documents, valid
      // only where the adapter declares exactly one field (the single-key
      // carrier case). Anything else is told what it
      // actually needs rather than silently dropping the value.
      let fields: Record<string, string>
      if (body.fields && typeof body.fields === 'object') {
        fields = body.fields
      } else if (typeof body.api_key === 'string' && declared.length === 1) {
        fields = { [declared[0]!.name]: body.api_key }
      } else if (typeof body.api_key === 'string') {
        return reply.status(400).send({
          error: {
            code: 'FIELDS_REQUIRED',
            message: `'${vertical}:${platform}' takes more than one credential field; send them as \`fields\`.`,
            fields: declared.map((f) => ({ name: f.name, label: f.label, required: f.required })),
          },
        })
      } else {
        fields = {}
      }

      const missing = required.filter((name) => !String(fields[name] ?? '').trim())
      if (missing.length > 0) {
        return reply.status(400).send({
          error: {
            code: 'MISSING_FIELDS',
            message: `Missing required credential field(s): ${missing.join(', ')}.`,
            fields: declared.map((f) => ({ name: f.name, label: f.label, required: f.required })),
          },
        })
      }

      // License: refuse before the credential is exchanged, which may call the platform.
      if (opts.assertCanCreateConnection) {
        try {
          await opts.assertCanCreateConnection(vertical)
        } catch (err) {
          if (isLicenseError(err)) return reply.status(403).send(err.toBody())
          throw err
        }
      }

      let credentials
      try {
        credentials = await adapter.exchangeCredentials(fields)
      } catch (err) {
        // The adapter may reach the platform to validate the key. A bad
        // credential is the caller's 400, not a 500.
        const message = err instanceof Error ? err.message : 'Credential exchange failed.'
        return reply.status(400).send({ error: { code: 'CREDENTIAL_EXCHANGE_FAILED', message } })
      }

      // A key-derived tenant is authoritative: the body cannot widen it.
      const tenantId =
        tenantFromKey !== undefined
          ? tenantFromKey
          : (body.tenant_id ?? credentials.tenantId ?? null)
      const label = body.label ?? null
      let id: string
      try {
        // The tenant this was minted for owns it. Nothing else records that
        // on this path — no Connect Link session is consumed — and the
        // developer-key middleware decides ownership from exactly those two
        // facts, so without this the owning tenant's own key was refused.
        id = await store.create(platform, tenantId, credentials, label, vertical, tenantId)
      } catch (err) {
        if (err instanceof DuplicateLabelError) {
          return reply
            .status(409)
            .send({ error: { code: 'DUPLICATE_LABEL', message: err.message } })
        }
        if (isLicenseError(err)) return reply.status(403).send(err.toBody())
        throw err
      }

      // Both best-effort, and both the same as the OAuth callback does — an
      // api-key connection that skipped them would receive no webhooks.
      try {
        const externalId = adapter.externalAccountId?.(credentials)
        if (externalId) await store.linkExternalAccount(platform, externalId, id, vertical)
      } catch (err) {
        request.log.warn({ platform, vertical, err }, 'external-account link failed')
      }
      if (adapter.registerWebhook) {
        try {
          const origin = resolvePublicBaseUrl(request, await resolveBase(request))
          const reg = await adapter.registerWebhook(
            credentials,
            `${origin}/webhooks/${vertical}/${platform}`,
          )
          if (reg.secret || reg.id) {
            const fresh = (await store.loadById(id)) ?? credentials
            await store.updateById(id, {
              ...fresh,
              ...(reg.secret ? { webhookSecret: reg.secret } : {}),
              extra: {
                ...(fresh.extra ?? {}),
                ...(reg.id ? { webhookRegistrationId: reg.id } : {}),
              },
            })
          }
        } catch (err) {
          request.log.warn({ platform, vertical, err }, 'webhook auto-registration failed')
        }
      }

      return reply.status(200).send({
        data: { id, platform, tenantId, label, status: 'connected' as const },
      })
    })

    // `form_post` arrives as a urlencoded BODY, which integration-server has no
    // parser for — Fastify only handles JSON out of the box. Scoped to this
    // plugin's encapsulation so nothing else starts accepting forms.
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

    /**
     * GET and POST, because the provider chooses which.
     *
     * A plain authorization-code flow redirects with the code in the QUERY
     * string. A provider that answers with a hybrid response (`code id_token`)
     * defaults to `response_mode=fragment` instead — and a fragment is never
     * transmitted to the server, so the callback fires with no `code` and no
     * `state` at all. ShipBob rewrites `response_type=code` into
     * `code id_token` server-side regardless of what is requested, so the only
     * way to receive the code is `response_mode=form_post`, which POSTs the
     * same fields as a form body.
     */
    fastify.route<{
      Params: { vertical: string; platform: string }
      Querystring: CallbackQuery
      Body: CallbackQuery
    }>({
      method: ['GET', 'POST'],
      url: '/auth/:vertical/:platform/callback',
      handler: async (request, reply) => {
        const { vertical, platform } = request.params
        // One source, whichever transport the provider used. A form_post body
        // carries exactly the fields a query-string redirect would.
        const {
          code,
          state,
          error: oauthError,
          error_description: oauthErrorDescription,
        } = {
          ...((request.query ?? {}) as CallbackQuery),
          ...((request.body ?? {}) as CallbackQuery),
        }

        // The customer declined, or the provider refused consent. RFC 6749 sends
        // `error` INSTEAD of `code`, so this must be answered before the
        // missing-param check below — otherwise the one case the provider
        // explained ("TenantConsent status DENIED") was reported back as
        // MISSING_PARAMS: a raw JSON blob telling the customer THEY had sent a
        // malformed request, for pressing Cancel.
        if (oauthError) {
          // Consume the state either way. It is single-use and now spent: leaving
          // it pending lets a declined dance be replayed until it expires.
          const declined = state ? consumePendingState(state) : null

          // Mid-link customer → back to their own Connect page, which is still
          // live and unconsumed, so they can simply try again. The reason is
          // passed as a fixed token, never the provider's text: this page is
          // customer-facing and branded, and echoing an arbitrary query string
          // onto it would make it a ready-made phishing surface.
          if (declined?.sessionId && connectSessions) {
            const linked = await connectSessions.getById(declined.sessionId)
            if (linked) {
              return reply.redirect(`/connect/${linked.token}?notice=declined`)
            }
          }

          // Admin-tooling or programmatic OAuth: no customer to send anywhere,
          // so answer in kind — and say who refused and why, which is the part
          // MISSING_PARAMS threw away.
          request.log.info(
            { vertical, platform, oauthError },
            'oauth authorization declined by provider',
          )
          return reply.status(400).send({
            error: {
              code: 'OAUTH_DECLINED',
              message:
                'The authorization was declined at the provider — no connection was created.',
              providerError: oauthError,
              ...(oauthErrorDescription ? { providerErrorDescription: oauthErrorDescription } : {}),
            },
          })
        }

        if (!code || !state) {
          return reply.status(400).send({
            error: {
              code: 'MISSING_PARAMS',
              message: '`code` and `state` query params are required.',
            },
          })
        }
        const pending = consumePendingState(state)
        if (!pending) {
          return reply.status(400).send({
            error: { code: 'INVALID_STATE', message: 'OAuth state expired or unknown.' },
          })
        }
        if (pending.platform !== platform || (pending.vertical && pending.vertical !== vertical)) {
          return reply.status(400).send({
            error: {
              code: 'STATE_MISMATCH',
              message:
                'Callback URL does not match the (vertical, platform) the OAuth dance was started with.',
            },
          })
        }
        const adapter = registry.get(vertical, platform)
        if (!adapter) {
          return reply.status(404).send({
            error: {
              code: 'ADAPTER_UNAVAILABLE',
              message: `Adapter '${vertical}:${platform}' is not enabled.`,
            },
          })
        }
        // Replays the PKCE verifier minted at authorize time. Undefined for
        // every adapter that does not declare `requiresPkce`, which keeps the
        // exchange byte-for-byte what it was.
        // Inputs collected at start (Shopify `shop`) take the dedicated exchange,
        // which also receives the verifier so an adapter needing both has one
        // method to implement. Null for every adapter that declares none.
        const credentials =
          pending.inputs && typeof adapter.exchangeCodeWithInputs === 'function'
            ? await adapter.exchangeCodeWithInputs(
                code,
                pending.redirectUri ?? '',
                pending.inputs,
                pending.codeVerifier ?? null,
              )
            : pending.codeVerifier && typeof adapter.exchangeCodeWithVerifier === 'function'
              ? await adapter.exchangeCodeWithVerifier(
                  code,
                  pending.redirectUri ?? '',
                  pending.codeVerifier,
                )
              : // A token request that must repeat the authorize scopes gets the
                // override authorize used, or undefined when there was none.
                typeof adapter.exchangeCodeWithScopes === 'function'
                ? await adapter.exchangeCodeWithScopes(
                    code,
                    pending.redirectUri ?? '',
                    pending.grantedScopes ?? undefined,
                  )
                : await adapter.exchangeCode(code, pending.redirectUri ?? '')
        // The inputs are what the API client needs after connect (the shop host),
        // so they live in the credential blob. The adapter's own `extra` wins:
        // it may have normalised the value.
        if (pending.inputs) {
          credentials.extra = { ...pending.inputs, ...(credentials.extra ?? {}) }
        }

        // Derive the deployment-tenant owner from the connect-link session,
        // when this OAuth dance came from one. Admin-tooling-started OAuth
        // (no sessionId) leaves owner_tenant_id NULL.
        const linkSession =
          pending.sessionId && connectSessions
            ? await connectSessions.getById(pending.sessionId)
            : null
        const ownerTenantId = linkSession?.tenantId ?? null
        // The schedule the connection starts with: the link's choice, or the
        // deployment default (null). A one-time link's connection is deleted
        // after its first successful sync — `once`, so nothing re-syncs it on
        // an interval meanwhile. Without a link (programmatic OAuth) it is the
        // default.
        const syncSchedule: SyncSchedule | null = linkSession?.oneTimeOnly
          ? { mode: 'once' }
          : (linkSession?.syncSchedule ?? null)

        let id: string
        // The label the connection was ACTUALLY created under. Reported below in
        // the connect_link.consumed webhook and the 201 body, which both used to
        // echo `pending.label` — right up until it collided, at which point they
        // named a label no connection had. Now that the label is derived from the
        // customer and the adapter, a returning customer reconnecting the same
        // adapter makes that collision the ordinary case rather than the odd one.
        let usedLabel: string | null = pending.label ?? null
        if (pending.sessionId) {
          // Connect Link flow. The customer has already logged in to the platform
          // and granted consent, and the tokens are in hand — a label collision
          // here used to answer them with raw JSON
          //   {"error":{"code":"DUPLICATE_LABEL", ...}}
          // and discard the grant, so the whole consent had to be repeated with a
          // fresh link. The label gets a suffix instead; the operator can rename
          // the connection in one click.
          let created: { id: string; label: string | null }
          try {
            created = await store.createWithUniqueLabel(
              platform,
              pending.tenantId ?? credentials.tenantId ?? null,
              credentials,
              pending.label,
              vertical,
              ownerTenantId,
              syncSchedule,
            )
          } catch (err) {
            if (!isLicenseError(err)) throw err
            request.log.warn(
              { vertical, platform, code: err.code, ...err.details },
              'connect-link connection refused by the license',
            )
            // The customer is mid-link: back to their own page, with words WE
            // own. Nothing was stored; the grant is dropped.
            if (linkSession) return reply.redirect(`/connect/${linkSession.token}?notice=capacity`)
            return reply.status(403).send(publicRefusalBody(err))
          }
          id = created.id
          usedLabel = created.label
          if (created.label !== pending.label) {
            request.log.info(
              // Not the labels themselves: a connect-link label is now derived
              // from the customer's name, or failing that their email address,
              // and no LOG_REDACT_PATHS entry reaches a log field like this one.
              // The id resolves to the label for anyone who needs it.
              { platform, vertical, connectionId: created.id },
              'connect-link label collided; connection created under a suffixed label',
            )
          }
        } else {
          // Operator/programmatic create. A 409 is actionable here — the caller
          // chose this label a moment ago and can choose another — and silently
          // renaming an API caller's connection would be worse.
          try {
            id = await store.create(
              platform,
              pending.tenantId ?? credentials.tenantId ?? null,
              credentials,
              pending.label,
              vertical,
              ownerTenantId,
              syncSchedule,
            )
          } catch (err) {
            if (err instanceof DuplicateLabelError) {
              return reply.status(409).send({
                error: { code: 'DUPLICATE_LABEL', message: err.message },
              })
            }
            if (isLicenseError(err)) {
              request.log.warn(
                { vertical, platform, code: err.code, ...err.details },
                'oauth callback refused by the license',
              )
              // Unauthenticated, like the start route: a generic body.
              return reply.status(403).send(publicRefusalBody(err))
            }
            throw err
          }
        }

        // Map this connection's external account id (Stripe acct, Xero tenant…)
        // so inbound webhooks resolve to it. Best-effort: a missing/duplicate id
        // must never break the OAuth callback.
        try {
          const externalId = adapter.externalAccountId?.(credentials)
          if (externalId) await store.linkExternalAccount(platform, externalId, id, vertical)
        } catch (err) {
          request.log.warn({ platform, vertical, err }, 'external-account link failed')
        }

        // Hybrid auto-registration: ask the platform to send its webhooks to us,
        // and persist any per-endpoint signing secret it returns. Best-effort —
        // platforms without programmatic registration are set up manually.
        if (adapter.registerWebhook) {
          try {
            const origin = resolvePublicBaseUrl(request, await resolveBase(request))
            const callbackUrl = `${origin}/webhooks/${vertical}/${platform}`
            const reg = await adapter.registerWebhook(credentials, callbackUrl)
            if (reg.secret || reg.id) {
              const fresh = (await store.loadById(id)) ?? credentials
              await store.updateById(id, {
                ...fresh,
                ...(reg.secret ? { webhookSecret: reg.secret } : {}),
                extra: {
                  ...(fresh.extra ?? {}),
                  ...(reg.id ? { webhookRegistrationId: reg.id } : {}),
                },
              })
            }
          } catch (err) {
            request.log.warn({ platform, vertical, err }, 'webhook auto-registration failed')
          }
        }

        // Connect Link flow: pending state carried a `sessionId`, so the
        // customer is mid-link, not a programmatic API consumer. Mark the
        // session consumed and 302-redirect them to the thank-you page.
        if (pending.sessionId && connectSessions) {
          const consumed = await connectSessions.markConsumed(pending.sessionId, id)
          if (consumed) {
            // Auto-sync on consume: kick off a background sync so the cache
            // is warm by the time the host's app reads it. No-op when no
            // SyncStore was wired (passthrough mode) or a job already exists.
            // Trigger only means not even this one.
            if (syncStore && syncSchedule?.mode !== 'trigger_only') {
              try {
                await syncStore.createIfIdle({
                  vertical,
                  connectionId: id,
                  platform,
                  tenantId: consumed.tenantId,
                  origin: 'connect',
                })
              } catch {
                /* never let sync enqueue break the redirect */
              }
            }

            if (webhookSubs) {
              try {
                await emitTenantEvent(
                  webhookSubs,
                  consumed.tenantId,
                  'connect_link.consumed',
                  {
                    ...consumed,
                    connection: {
                      id,
                      vertical,
                      platform,
                      tenantId: pending.tenantId ?? credentials.tenantId ?? null,
                      label: usedLabel,
                    },
                  },
                  { deliveries: webhookDeliveries },
                )
              } catch {
                /* never let webhook delivery break the redirect */
              }
            }
            const target = consumed.redirectUrl ?? `/connect/${consumed.token}/done`
            return reply.redirect(target)
          }
        }

        return reply.status(201).send({
          data: {
            id,
            vertical,
            platform,
            tenantId: pending.tenantId ?? credentials.tenantId ?? null,
            label: usedLabel,
            status: 'connected',
          },
        })
      },
    })

    // Connection deletion lives at:
    //   DELETE /connections/{id}     — operator (X-Admin-Secret), cross-tenant
    //   DELETE /v1/connections/{id}  — tenant-scoped Bearer key + connections:write
    // The /auth namespace is for OAuth ceremony only (start, callback).
  }
}
