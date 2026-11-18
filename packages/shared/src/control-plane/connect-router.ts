/**
 * Public Connect Link router. Mounted on integration-server.
 *
 *   GET  /connect/:token              hosted picker + form
 *   GET  /connect/:token/done         thank-you page
 *   GET  /connect/sessions/:token     JSON session metadata + catalog
 *   POST /connect/sessions/:token/oauth-start
 *   POST /connect/sessions/:token/credentials
 *
 * The OAuth callback (`/auth/:vertical/:platform/callback`) handles
 * marking the session consumed itself — see `auth-router.ts`. This router
 * only owns the inbound side (rendering + state mint + non-OAuth submit).
 */
import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { CredentialStore } from '../auth/store'
import { ConnectSessionStore, type ConnectSessionRow } from '../auth/connect-sessions'
import { EndUserStore } from '../auth/end-users'
import { generatePkcePair, generateState, redirectUriIn, storePendingState } from '../auth/oauth'
import { collectOAuthInputs } from '../auth/oauth-inputs'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'
import type { SyncSchedule } from '../data-store/sync-schedule'
import { resolvePublicBaseUrl } from './public-base-url'
import { HostInfoFetcher, type HostBranding } from './host-info'
import { errorHtml, landingHtml, thankYouHtml, type CatalogEntry } from './connect-html'
import type { PlatformEntry } from './platforms-router'
import { unsupportedIndex, unsupportedRefusal } from '../reference/platform-status'
import { consume } from './rate-limit'
import type { RateLimitConfigSource } from './api-key-middleware'
import { isLicenseError } from '../licensing/errors'

export interface ConnectRouterOptions {
  store: CredentialStore
  registry: UnifiedAdapterRegistry
  sessions: ConnectSessionStore
  endUsers: EndUserStore
  hostInfo: HostInfoFetcher
  /**
   * Platform metadata, same array passed to `createUnifiedPlatformsRouter`.
   * The connect router intersects this with the live registry to surface
   * only enabled, link-ready adapters.
   */
  platforms: PlatformEntry[]
  /**
   * Optional resolver for the operator-set `companyInfo.baseUrl`. Used to
   * build the OAuth `redirect_uri` for the upstream platform. Falls
   * through to `PUBLIC_BASE_URL` env or request host.
   */
  getCompanyBaseUrl?: () => Promise<string | null> | string | null
  /**
   * Rate limit for the whole public surface, keyed on client IP — this is an
   * unauthenticated router, so the IP is the only identity there is, and a
   * per-token key would reset on every guess. Resolved per request so the
   * `rate_limit.connect_link.per_minute` runtime setting applies live.
   */
  rateLimit?: RateLimitConfigSource
  /**
   * License (integration-server): throws a LicenseError when a connection for
   * `vertical` may not be created now. Asked before the provider redirect and
   * before a static credential is exchanged, so a refusal comes before the
   * customer's consent, not after it. CredentialStore's create guard stays the
   * authority: a race can still refuse at the callback.
   */
  assertCanCreateConnection?: (vertical: string) => Promise<void>
}

function isOAuth(authType?: string): boolean {
  return authType === 'oauth2'
}

/**
 * Resolve the OAuth `overrideScopes` for a link given its scope policy and the
 * chosen platform's curated read-only scopes. `undefined` means "no override —
 * use the platform default" (read_only with no curated set, or platform_default).
 * Exported as a pure function so the policy semantics are unit-testable.
 */
export function resolveOverrideScopesFor(
  scopePolicy: ConnectSessionRow['scopePolicy'],
  customScopes: string[] | null,
  readScopes: string[] | undefined,
): string[] | undefined {
  switch (scopePolicy) {
    case 'custom':
      return customScopes ?? undefined
    case 'read_only':
      return readScopes && readScopes.length > 0 ? readScopes : undefined
    case 'platform_default':
    default:
      return undefined
  }
}

/**
 * The label a completed link gives the connection it produces:
 * "<customer> - <adapter>". Operators browse connections, not links, so the
 * link's own label ("Q2 onboarding") stops identifying anything as soon as a
 * second customer completes the same link.
 *
 * The customer is their display name falling back to their whole email
 * address — `email.split('@')[0]` reads worse than the address, same finding
 * as `greetingName`. The adapter is the catalogue's display name falling back
 * to its slug, which is all a deployment carrying an adapter the catalogue has
 * not caught up with can offer.
 *
 * Returns `linkLabel` when there is no customer to name. Never returns empty:
 * `createWithUniqueLabel` treats a falsy label as "no label", and the unique
 * index covers `COALESCE(label,'')`, so an empty one surfaces a collision as a
 * raw driver error rather than a suffix.
 *
 * Exported as a pure function so the rule is unit-testable.
 */
export function connectionLabelFor(
  customer: { displayName?: string | null; email?: string | null } | null | undefined,
  adapterName: string | null | undefined,
  slug: string,
  linkLabel: string,
): string {
  const person = customer?.displayName?.trim() || customer?.email?.trim()
  if (!person) return linkLabel
  return `${person} - ${adapterName?.trim() || slug}`
}

function isAllowed(session: ConnectSessionRow, vertical: string, platform: string): boolean {
  if (session.allowedVerticals.length > 0 && !session.allowedVerticals.includes(vertical))
    return false
  if (session.allowedPlatforms.length > 0) {
    return session.allowedPlatforms.some((p) => p.vertical === vertical && p.slug === platform)
  }
  return true
}

function expiredOrConsumed(session: ConnectSessionRow): boolean {
  return session.status !== 'active'
}

export function createConnectRouter(opts: ConnectRouterOptions): FastifyPluginAsync {
  const { store, registry, sessions, endUsers, hostInfo, platforms, getCompanyBaseUrl, rateLimit } =
    opts

  // (vertical:slug) → curated read-only scopes, for the 'read_only' scope policy.
  const readScopesByKey = new Map<string, string[]>()
  // (vertical:slug) → catalogue display name, for the completion label. Indexed
  // once here rather than scanned per request — `platforms` is ~1,500 entries
  // in a full deployment.
  const platformNamesByKey = new Map<string, string>()
  for (const p of platforms) {
    const rs = p.readScopes
    if (Array.isArray(rs) && rs.length > 0)
      readScopesByKey.set(`${p.vertical}:${p.slug}`, rs.map(String))
    if (p.name) platformNamesByKey.set(`${p.vertical}:${p.slug}`, p.name)
  }
  // (vertical:slug) → why this platform can't be connected today. Checked at
  // the same two choke points as the catalog: a platform never gets past
  // this even if the registry already has it enabled (an operator can mark
  // a platform unsupported after having enabled it).
  const unsupportedByKey = unsupportedIndex(platforms)

  /**
   * Resolve the OAuth `overrideScopes` for a link at OAuth-start, per its
   * scope policy. Returns `undefined` to mean "no override — use the platform
   * default" (read_only with no curated set, or platform_default).
   */
  function resolveOverrideScopes(
    session: ConnectSessionRow,
    vertical: string,
    platform: string,
  ): string[] | undefined {
    return resolveOverrideScopesFor(
      session.scopePolicy,
      session.scopes,
      readScopesByKey.get(`${vertical}:${platform}`),
    )
  }

  /**
   * The label to create this link's connection under, resolved at completion
   * so the customer bound by a self-register link counts too. Deliberately no
   * `includePii` — display name and email are plaintext columns, and PII
   * decryption stays confined to the thank-you page.
   */
  async function deriveConnectionLabel(
    session: ConnectSessionRow,
    vertical: string,
    platform: string,
  ): Promise<string> {
    const customer = session.endUserId ? await endUsers.getById(session.endUserId) : null
    return connectionLabelFor(
      customer,
      platformNamesByKey.get(`${vertical}:${platform}`),
      platform,
      session.label,
    )
  }

  function buildCatalog(session: ConnectSessionRow): CatalogEntry[] {
    const out: CatalogEntry[] = []
    for (const p of platforms) {
      if (!isAllowed(session, p.vertical, p.slug)) continue
      // Unsupported platforms stay off the catalog even when the registry
      // already has them enabled — the customer must never be offered
      // something that can't complete.
      if (unsupportedByKey.has(`${p.vertical}:${p.slug}`)) continue
      const adapter = registry.get(p.vertical, p.slug)
      if (!adapter) continue // not enabled in this deployment
      const oauth = isOAuth(p.auth_type)
      let credentialFields: CatalogEntry['credentialFields']
      // Per-customer inputs an OAuth adapter needs before it can build its
      // authorize URL (Shopify `shop`). Only OAuth tiles render them.
      const oauthFields = oauth ? adapter.oauthFields?.() : undefined
      if (!oauth) {
        if (
          typeof adapter.credentialFields !== 'function' ||
          typeof adapter.exchangeCredentials !== 'function'
        ) {
          // Adapter isn't link-ready yet — hide it so the customer doesn't pick something that can't complete.
          continue
        }
        credentialFields = adapter.credentialFields()
      }
      out.push({
        vertical: p.vertical,
        slug: p.slug,
        name: p.name,
        authType: p.auth_type ?? 'oauth2',
        oauth,
        credentialFields,
        ...(oauthFields && oauthFields.length > 0 ? { oauthFields } : {}),
      })
    }
    out.sort((a, b) =>
      a.vertical === b.vertical
        ? a.name.localeCompare(b.name)
        : a.vertical.localeCompare(b.vertical),
    )
    return out
  }

  /**
   * Set a Content-Security-Policy on a hosted-connect HTML response and return
   * the per-response nonce for its single inline <script>. The page's own
   * escaping already neutralises the injection sink (see connect-html's
   * jsonForScript); this CSP is the containment layer, so a script that ever
   * slips the escaper still cannot run. `style-src 'unsafe-inline'` is
   * deliberate — operator branding injects inline <style>, and styles are not
   * the script-execution vector.
   */
  function applyConnectCsp(reply: FastifyReply): string {
    const nonce = randomBytes(16).toString('base64')
    reply.header(
      'content-security-policy',
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${nonce}'; ` +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self' data:; " +
        "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    )
    return nonce
  }

  async function renderError(
    reply: FastifyReply,
    status: number,
    title: string,
    body: string,
  ): Promise<unknown> {
    const host = await hostInfo.get()
    applyConnectCsp(reply)
    return reply.status(status).type('text/html').send(errorHtml({ host, status, title, body }))
  }

  // A Connect Link refusal is customer-facing: no license words and no counts.
  // The operator reads the details in the log.
  const CUSTOMER_REFUSAL =
    'This service cannot accept new connections right now. Nothing was saved. Please contact the company that sent you this link.'
  async function refuseIfCannotCreate(
    vertical: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    if (!opts.assertCanCreateConnection) return false
    try {
      await opts.assertCanCreateConnection(vertical)
      return false
    } catch (err) {
      if (!isLicenseError(err)) throw err
      request.log.warn(
        { vertical, code: err.code, ...err.details },
        'connect link refused by the license',
      )
      await reply.status(403).send({ error: { code: err.code, message: CUSTOMER_REFUSAL } })
      return true
    }
  }

  return async (fastify) => {
    if (rateLimit) {
      fastify.addHook('onRequest', async (request, reply) => {
        const config = typeof rateLimit === 'function' ? rateLimit(request) : rateLimit
        const rl = await consume(`connect:${request.ip}`, config)
        if (rl.ok) return
        const retrySec = Math.ceil(rl.retryAfterMs / 1000)
        reply.header('retry-after', String(retrySec))
        // The landing/thank-you GETs are opened by a browser — answer in kind.
        if (request.method === 'GET') {
          return renderError(
            reply,
            429,
            'Too many requests',
            `Please wait ${retrySec} seconds and try again.`,
          )
        }
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded — retry in ${retrySec}s.`,
          },
        })
      })
    }

    fastify.get<{ Params: { token: string }; Querystring: { notice?: string } }>(
      '/connect/:token',
      async (request, reply) => {
        const session = await sessions.getByToken(request.params.token)
        if (!session)
          return renderError(
            reply,
            404,
            'Link not found',
            'This Connect link is not valid. Ask the host for a fresh one.',
          )
        if (expiredOrConsumed(session)) {
          const msg =
            session.status === 'consumed'
              ? 'This link has already been used. Ask the host to send a fresh one if you need to reconnect.'
              : 'This link has expired. Ask the host to send a fresh one.'
          return renderError(reply, 410, 'Link expired or used', msg)
        }
        const host = await hostInfo.get()
        const customer = session.endUserId ? await endUsers.getById(session.endUserId) : null
        const catalog = buildCatalog(session)
        const preselect =
          session.allowedPlatforms.length === 1
            ? {
                vertical: session.allowedPlatforms[0]!.vertical,
                platform: session.allowedPlatforms[0]!.slug,
              }
            : null

        // A fixed set of reasons, each with copy WE own. The value arrives in a
        // query string, so anything echoed through would let a crafted link put
        // arbitrary text on a branded, customer-facing page — an unknown notice
        // is therefore ignored rather than displayed.
        const NOTICES: Record<string, string> = {
          declined:
            'Authorization was cancelled, so nothing was connected. You can try again below.',
          capacity:
            'This connection could not be saved: the service that sent you this link cannot accept new connections right now. Nothing was stored. Please contact them.',
        }
        const flash = request.query.notice ? (NOTICES[request.query.notice] ?? null) : null

        const nonce = applyConnectCsp(reply)
        return reply.type('text/html').send(
          landingHtml({
            token: session.token,
            host,
            customerEmail: customer?.email ?? null,
            catalog,
            preselect,
            flash,
            selfRegister: session.allowSelfRegister && !session.endUserId,
            nonce,
          }),
        )
      },
    )

    fastify.post<{
      Params: { token: string }
      Body: { email?: unknown; displayName?: unknown }
    }>('/connect/:token/customer', async (request, reply) => {
      const session = await sessions.getByToken(request.params.token)
      if (!session) return reply.status(404).send({ error: { code: 'SESSION_NOT_FOUND' } })
      if (expiredOrConsumed(session))
        return reply.status(410).send({ error: { code: 'SESSION_GONE' } })
      if (!session.allowSelfRegister)
        return reply.status(403).send({ error: { code: 'SELF_REGISTER_DISABLED' } })
      if (session.endUserId)
        return reply.status(409).send({ error: { code: 'ALREADY_REGISTERED' } })

      const rawEmail = typeof request.body?.email === 'string' ? request.body.email : ''
      const email = rawEmail.trim().toLowerCase()
      // RFC-5322-lite: requires `local@host.tld`. Mirrors the loose validation
      // used elsewhere in the codebase (see end-users router).
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply
          .status(400)
          .send({ error: { code: 'INVALID_EMAIL', message: 'Provide a valid email.' } })
      }
      const rawName = typeof request.body?.displayName === 'string' ? request.body.displayName : ''
      const displayName = rawName.trim().slice(0, 200) || null

      const user = await endUsers.upsertByEmail({
        tenantId: session.tenantId,
        email,
        displayName,
      })
      const updated = await sessions.attachEndUser(session.id, user.id)
      if (!updated) {
        // Lost a race with another tab; tell the client the session is bound now.
        return reply.status(409).send({ error: { code: 'ALREADY_REGISTERED' } })
      }
      return reply.send({ data: { ok: true } })
    })

    fastify.get<{ Params: { token: string } }>('/connect/:token/done', async (request, reply) => {
      const session = await sessions.getByToken(request.params.token)
      if (!session)
        return renderError(reply, 404, 'Link not found', 'This Connect link is not valid.')
      if (session.status !== 'consumed' || !session.connectionId) {
        return renderError(
          reply,
          409,
          'Not yet connected',
          "This link hasn't been completed yet. Open the original link to finish the connection.",
        )
      }
      const conn = await store.getRow(session.connectionId)
      const host = await hostInfo.get()
      // `includePii` only here, and only on this page. The greeting wants a
      // first name, and `pii.firstName` is where it lives for a customer
      // created through the admin or API — self-registered ones have only
      // `displayName`, so both are passed and `greetingName` picks.
      //
      // The page is the customer's own completion screen and renders their own
      // given name; it already printed part of their email address to whoever
      // holds this consumed token, so this narrows what is shown rather than
      // widening it. `decryptPii` is a pure decrypt with no audit side effect —
      // the `user.pii_reveal` audit entry belongs to the admin's reveal route,
      // which is an operator reading someone else's data, not this.
      const customer = session.endUserId
        ? await endUsers.getById(session.endUserId, { includePii: true })
        : null
      applyConnectCsp(reply)
      return reply.type('text/html').send(
        thankYouHtml({
          host,
          platform: conn?.platform ?? '—',
          vertical: conn?.vertical ?? '—',
          connectionId: conn?.id ?? null,
          consumedAtISO: new Date(session.consumedAt!).toISOString(),
          customerEmail: customer?.email ?? null,
          customerFirstName: customer?.pii?.firstName ?? null,
          customerDisplayName: customer?.displayName ?? null,
        }),
      )
    })

    fastify.get<{ Params: { token: string } }>(
      '/connect/sessions/:token',
      async (request, reply) => {
        const session = await sessions.getByToken(request.params.token)
        if (!session) return reply.status(404).send({ error: { code: 'SESSION_NOT_FOUND' } })
        if (expiredOrConsumed(session))
          return reply.status(410).send({ error: { code: 'SESSION_GONE', status: session.status } })
        const host = await hostInfo.get()
        const customer = session.endUserId ? await endUsers.getById(session.endUserId) : null
        return {
          data: {
            label: session.label,
            customerEmail: customer?.email ?? null,
            allowedVerticals: session.allowedVerticals,
            allowedPlatforms: session.allowedPlatforms,
            expiresAt: new Date(session.expiresAt).toISOString(),
            host: stripHostForPublic(host),
            catalog: buildCatalog(session),
          },
        }
      },
    )

    fastify.post<{
      Params: { token: string }
      Body: { vertical?: string; platform?: string; fields?: Record<string, string> }
    }>('/connect/sessions/:token/oauth-start', async (request, reply) => {
      const session = await sessions.getByToken(request.params.token)
      if (!session) return reply.status(404).send({ error: { code: 'SESSION_NOT_FOUND' } })
      if (expiredOrConsumed(session))
        return reply.status(410).send({ error: { code: 'SESSION_GONE' } })
      const { vertical, platform, fields } = request.body ?? {}
      if (!vertical || !platform)
        return reply.status(400).send({
          error: { code: 'MISSING_PARAMS', message: '`vertical` and `platform` are required.' },
        })
      if (!isAllowed(session, vertical, platform))
        return reply.status(403).send({ error: { code: 'NOT_IN_SCOPE' } })
      const unsupported = unsupportedByKey.get(`${vertical}:${platform}`)
      if (unsupported) {
        return reply
          .status(400)
          .send(
            unsupportedRefusal(
              platformNamesByKey.get(`${vertical}:${platform}`) ?? platform,
              unsupported,
            ),
          )
      }
      const adapter = registry.get(vertical, platform)
      if (!adapter) return reply.status(404).send({ error: { code: 'ADAPTER_UNAVAILABLE' } })

      // Inputs the adapter declared it needs before the redirect — a per-customer
      // host such as Shopify's `shop`. Undeclared keys never get past here, and
      // a missing required one is named, not left for the adapter to trip over.
      const { inputs, missing } = collectOAuthInputs(adapter.oauthFields?.(), fields)
      if (missing.length > 0)
        return reply.status(400).send({
          error: {
            code: 'MISSING_OAUTH_FIELDS',
            message: `Required before connecting: ${missing.join(', ')}.`,
            fields: missing,
          },
        })

      if (await refuseIfCannotCreate(vertical, request, reply)) return reply
      const state = generateState()
      const baseInputs = await resolveBaseUrlInputs(getCompanyBaseUrl)
      const redirectUri = `${resolvePublicBaseUrl(request, baseInputs)}/auth/${vertical}/${platform}/callback`
      // The callback creates the connection under this label verbatim, so the
      // customer-and-adapter name has to be settled here, before we hand them
      // off to the platform.
      // PKCE only where the platform demands it — some providers reject
      // parameters they did not expect, so this stays off by default.
      const pkce = adapter.capabilities?.requiresPkce ? generatePkcePair() : undefined
      // Resolve scopes per the link's scope policy (read_only / platform_default
      // / custom), per-platform — so a multi-platform link can still mean
      // "read-only". `undefined` means no override; adapters that support
      // per-call scopes use the value, others fall back to their config default.
      const overrideScopes = resolveOverrideScopes(session, vertical, platform)
      const url = adapter.getAuthUrl(state, overrideScopes, pkce?.challenge, inputs ?? undefined)
      storePendingState(state, platform, {
        vertical,
        label: await deriveConnectionLabel(session, vertical, platform),
        tenantId: session.tenantId,
        // The exchange must replay the redirect_uri the provider was sent, and
        // that is the adapter's own Redirect URI — possibly https on an http
        // deployment. The derived callback covers URLs that carry none.
        redirectUri: redirectUriIn(url) ?? redirectUri,
        sessionId: session.id,
        codeVerifier: pkce?.verifier ?? null,
        inputs,
        // Parked in pending state too: some token requests must repeat the
        // authorize scopes, and the callback has no link to re-resolve them from.
        grantedScopes: overrideScopes ?? null,
      })
      return { data: { redirectUrl: url } }
    })

    fastify.post<{
      Params: { token: string }
      Body: { vertical?: string; platform?: string; fields?: Record<string, string> }
    }>('/connect/sessions/:token/credentials', async (request, reply) => {
      const session = await sessions.getByToken(request.params.token)
      if (!session) return reply.status(404).send({ error: { code: 'SESSION_NOT_FOUND' } })
      if (expiredOrConsumed(session))
        return reply.status(410).send({ error: { code: 'SESSION_GONE' } })
      const { vertical, platform, fields } = request.body ?? {}
      if (!vertical || !platform)
        return reply.status(400).send({ error: { code: 'MISSING_PARAMS' } })
      if (!isAllowed(session, vertical, platform))
        return reply.status(403).send({ error: { code: 'NOT_IN_SCOPE' } })
      const unsupported = unsupportedByKey.get(`${vertical}:${platform}`)
      if (unsupported) {
        return reply
          .status(400)
          .send(
            unsupportedRefusal(
              platformNamesByKey.get(`${vertical}:${platform}`) ?? platform,
              unsupported,
            ),
          )
      }
      const adapter = registry.get(vertical, platform)
      if (!adapter) return reply.status(404).send({ error: { code: 'ADAPTER_UNAVAILABLE' } })
      if (typeof adapter.exchangeCredentials !== 'function') {
        return reply.status(400).send({
          error: {
            code: 'ADAPTER_NOT_LINK_READY',
            message: 'This adapter does not support direct credential entry.',
          },
        })
      }

      if (await refuseIfCannotCreate(vertical, request, reply)) return reply
      let credentials
      try {
        credentials = await adapter.exchangeCredentials(fields ?? {})
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Credential exchange failed.'
        return reply.status(400).send({ error: { code: 'CREDENTIAL_EXCHANGE_FAILED', message } })
      }

      // Same reasoning as the OAuth callback: the customer has already supplied
      // and had their credentials accepted by the platform, so a label
      // collision must not throw that away. Suffix and continue.
      const label = await deriveConnectionLabel(session, vertical, platform)
      // Same rule as the OAuth callback. No sync is enqueued from here: the
      // scheduler gives a default, custom or one-time connection its first
      // sync within one tick, and a trigger-only one never gets one.
      const syncSchedule: SyncSchedule | null = session.oneTimeOnly
        ? { mode: 'once' }
        : session.syncSchedule
      let created: { id: string; label: string | null }
      try {
        created = await store.createWithUniqueLabel(
          platform,
          session.tenantId,
          credentials,
          label,
          vertical,
          // The link's tenant owns what it creates. Omitted here while the OAuth
          // callback passed it, which wrote `owner_tenant_id` NULL and left the
          // connection invisible to the very tenant whose link made it — the
          // adapters that complete on this path are exactly the api-key ones, so
          // nothing about the flow made the gap visible.
          session.tenantId,
          syncSchedule,
        )
      } catch (err) {
        if (!isLicenseError(err)) throw err
        request.log.warn(
          { vertical, platform, code: err.code, ...err.details },
          'connect link refused by the license',
        )
        return reply.status(403).send({ error: { code: err.code, message: CUSTOMER_REFUSAL } })
      }
      const connectionId = created.id
      if (created.label !== label) {
        request.log.info(
          // The label is derived from the customer's name, or failing that
          // their email address, so it is not loggable: no LOG_REDACT_PATHS
          // entry covers a message field, and this line runs at info. The
          // connection id is the handle worth having anyway — it is what
          // `GET /v1/connections/{id}` takes, and it resolves to the label.
          { platform, vertical, connectionId: created.id },
          'connect-link label collided; connection created under a suffixed label',
        )
      }

      // Best-effort external-account link for inbound webhook routing.
      try {
        const externalId = adapter.externalAccountId?.(credentials)
        if (externalId)
          await store.linkExternalAccount(platform, externalId, connectionId, vertical)
      } catch (err) {
        request.log.warn({ platform, vertical, err }, 'external-account link failed')
      }

      // Hybrid auto-registration (api-key adapters that support it). Best-effort.
      if (adapter.registerWebhook) {
        try {
          const origin = resolvePublicBaseUrl(
            request,
            await resolveBaseUrlInputs(getCompanyBaseUrl),
          )
          const reg = await adapter.registerWebhook(
            credentials,
            `${origin}/webhooks/${vertical}/${platform}`,
          )
          if (reg.secret || reg.id) {
            const fresh = (await store.loadById(connectionId)) ?? credentials
            await store.updateById(connectionId, {
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

      await sessions.markConsumed(session.id, connectionId)
      // Same contract as the OAuth callback: the developer's redirectUrl wins,
      // the hosted thank-you page is the fallback. The client-side submit
      // navigates wherever this says — hardcoding /done there would leave
      // non-OAuth adapters unable to return the customer to the developer's
      // app.
      return reply.status(201).send({
        data: {
          connectionId,
          redirect: session.redirectUrl ?? `/connect/${session.token}/done`,
        },
      })
    })
  }
}

async function resolveBaseUrlInputs(getter?: () => Promise<string | null> | string | null) {
  if (!getter) return {}
  try {
    const v = await getter()
    return { companyBaseUrl: v ?? null }
  } catch {
    return {}
  }
}

function stripHostForPublic(host: HostBranding): Omit<HostBranding, 'baseUrl'> {
  const { baseUrl: _b, ...rest } = host
  return rest
}
