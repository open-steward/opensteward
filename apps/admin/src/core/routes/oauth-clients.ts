/**
 * Admin UI for accepting OIDC bearer tokens on the developer API.
 *
 *   GET  /oauth-clients                        issuer list + readiness (operator+)
 *   GET  /oauth-clients/new                    register form (admin)
 *   POST /oauth-clients                        create, or re-render on error (admin)
 *   POST /oauth-clients/discover               the Test button (admin)
 *   GET  /oauth-clients/:id                    one issuer, its clients and rules (operator+)
 *   POST /oauth-clients/:id                    update (admin)
 *   POST /oauth-clients/:id/delete             delete, with its clients (admin)
 *   POST /oauth-clients/:id/clients            register a service account (admin)
 *   POST /oauth-clients/clients/:id/revoke     revoke one (admin)
 *   POST /oauth-clients/:id/rules              add a scope-mapping rule (admin)
 *   POST /oauth-clients/rules/:id/delete       remove one (admin)
 *
 * Reads are operator+ so an operator can answer "which service accounts can
 * reach us?" without being able to add one. Every write is admin-only.
 *
 * No field on this page is a secret. OpenSteward is only a resource server:
 * it verifies with the issuer's published public keys and never holds a client
 * secret, so none of the masking and merge-don't-replace machinery that the
 * SSO provider form needs applies here.
 */
import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient, OAuthPresetRecord } from '../proxy/admin-api-client'
import { SAFE_DEFAULT_SCOPES, VERTICAL_SCOPE_ITEMS } from './api-keys-defaults'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'

const DEFAULT_TENANT = 'default'

/**
 * The Authority column's display text, keyed by `authorityMode`.
 *
 * Owned here, not in the view: the route hoists `MODE_LABEL[authorityMode]`
 * onto each row as `authorityLabel` before the table's filter/sort runs, and
 * the view renders that same field — so the string an operator types into
 * the Authority filter box and the string sitting in the cell next to it are
 * the same value BY CONSTRUCTION. A route that filtered on the raw enum
 * while the view displayed this label let a filter for "Token decides" match
 * zero rows, with matching issuers sitting right there on the page.
 */
export const MODE_LABEL: Record<string, string> = {
  registry: 'Registry',
  intersect: 'Registry ∩ token',
  external: 'Token decides',
}

/**
 * Which columns of the OAuth-issuer table sort and filter, and on what.
 *
 * There is no `i.authority` or `i.verified` on this row. Authority sorts and
 * filters on `i.authorityLabel` — the hoisted MODE_LABEL text, not the raw
 * `authorityMode` enum, for the reason above. Verified sorts on the raw
 * `i.lastVerifiedAt` (unverified sorts last, same as any other absent value).
 *
 * Issuer combines `i.name` AND `i.issuer` (must-fix 4, THE RULE THAT MATTERS
 * MOST): the cell (oauth-clients/index.ejs) renders both — the display name
 * and, in mono underneath it, the OIDC issuer URL. An accessor reading only
 * `i.name` left the visible issuer URL unfindable through this box; typing
 * `idp.corp.example` — text on screen, in this column — returned zero rows.
 * Same shape as connect-links' `tenantLabel`.
 *
 * EXPORTED for `admin/tests/journeys/sort-key-cell-parity.test.ts`, which
 * asserts ISSUER equals its cell text exactly. Ordering cannot reach the join:
 * `[name, issuer].join(x)` is always an extension of `name`, so every value of
 * `x` sorts the same way and the names alone decide the page order. Only
 * equality catches a changed separator.
 *
 * TENANTS is not in that check: `tenantCount` is derived per row in the GET
 * handler below (from a detail fetch, or from `allowedTenants`), so `get` over
 * a bare fixture row reads `undefined`. It is pinned by ordering alone — it is
 * also on the cell-parity opt-out list, since the cell renders a tenant LIST
 * and the column sorts on how many. Closable by having the test derive the
 * count the way the handler does.
 */
export const OAUTH_TABLE: TableSpec = {
  id: 'oauth-filters',
  baseUrl: '/oauth-clients',
  columns: [
    {
      key: 'issuer',
      header: 'Issuer',
      sortable: true,
      filter: 'text',
      get: (i: any) => [i.name, i.issuer].filter(Boolean).join(' '),
    },
    { key: 'authority', header: 'Authority', sortable: true, filter: 'text', get: (i: any) => i.authorityLabel },
    // Derived per row below, before applyTableQuery runs — the cell itself
    // renders from the separate `served` map, not from a field on the row.
    { key: 'tenants', header: 'Tenants', sortable: true, get: (i: any) => i.tenantCount },
    { key: 'verified', header: 'Verified', sortable: true, get: (i: any) => i.lastVerifiedAt },
    { key: 'status', header: 'Status', sortable: true, get: (i: any) => (i.enabled ? 'enabled' : 'disabled') },
  ],
}

/**
 * Pull a readable message out of a proxy error.
 *
 * admin-api answers `{ error: { code, message } }`, but a few older surfaces
 * still answer `{ error: "..." }`, so both shapes are handled rather than
 * rendering `[object Object]` at the operator.
 */
function apiError(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { error?: string | { message?: string } } }
    message?: string
  }
  const raw = e?.response?.data?.error
  if (typeof raw === 'string') return raw
  if (raw && typeof raw.message === 'string') return raw.message
  return e?.message ?? fallback
}

/** Split a textarea of one-per-line values into a trimmed list. */
function lines(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function asArray(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return raw
  return typeof raw === 'string' && raw.length > 0 ? [raw] : []
}

interface IssuerFormBody {
  name?: string
  preset?: string
  issuer?: string
  jwksUri?: string
  audience?: string
  subjectClaim?: string
  scopeClaim?: string
  authorityMode?: 'registry' | 'intersect' | 'external'
  tenantClaim?: string
  allowedTenants?: string
  maxTokenLifetimeS?: string
  enabled?: string
}

export function createOAuthClientsRoutes(apiClient: AdminApiClient) {
  return async function oauthClientsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('operator'))

    const presetsFor = (token: string): Promise<OAuthPresetRecord[]> =>
      apiClient.listOAuthPresets(token).catch(() => [])

    fastify.get('/oauth-clients', async (request, reply) => {
      const token = request.sessionUser!.token
      const [issuers, readiness] = await Promise.all([
        apiClient.listOAuthIssuers(token),
        // Best-effort: the readiness banner is context, not the page.
        apiClient
          .getOAuthReadiness(token)
          .catch(() => ({ ready: false, reason: 'Could not reach the integration-server.' })),
      ])
      // Which tenants each issuer can act for — the answer to "where is the
      // tenant?" on a page whose rows have none of their own. An issuer is
      // registered once for the whole deployment; the tenant is decided per
      // token. In the registry modes it lives on the service accounts, so
      // that takes one detail fetch per issuer (issuers are few). In
      // token-decides mode it is the issuer's own allow-list, already on the
      // row. Best-effort: a failed fetch shows a dash, never a 500.
      const served: Record<string, { tenants: string[]; accounts: number | null } | null> = {}
      await Promise.all(
        issuers.map(async (i) => {
          if (i.authorityMode === 'external') {
            served[i.id] = { tenants: [...i.allowedTenants], accounts: null }
            return
          }
          const detail = await apiClient.getOAuthIssuer(token, i.id).catch(() => null)
          if (!detail) {
            served[i.id] = null
            return
          }
          const active = detail.clients.filter((c) => !c.revokedAt)
          served[i.id] = {
            tenants: [...new Set(active.map((c) => c.tenantId))].sort(),
            accounts: active.length,
          }
        }),
      )
      // Sorted on, not rendered: the Tenants cell itself renders four
      // different shapes (a tenant list, "none allowed", "no service
      // accounts", or a dash), so the honest scalar behind it is how many
      // tenants the issuer admits. undefined when the detail fetch failed,
      // which sorts last.
      const rows = issuers.map((i) => ({
        ...i,
        tenantCount:
          i.authorityMode === 'external' ? i.allowedTenants.length : served[i.id]?.tenants.length,
        // The view renders this exact field for Authority, not
        // `MODE_LABEL[i.authorityMode]` recomputed locally — see MODE_LABEL's
        // own comment for why that split is what broke the filter.
        authorityLabel: MODE_LABEL[i.authorityMode] || i.authorityMode,
      }))
      const tableState = parseTableQuery(request.query, OAUTH_TABLE)
      return reply.view('oauth-clients/index.ejs', {
        user: request.sessionUser,
        issuers: applyTableQuery(rows, tableState, OAUTH_TABLE),
        readiness,
        served,
        tableSpec: OAUTH_TABLE,
        tableState,
      })
    })

    fastify.get(
      '/oauth-clients/new',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        return reply.view('oauth-clients/new.ejs', {
          user: request.sessionUser,
          presets: await presetsFor(token),
          defaults: {
            name: '',
            preset: 'generic',
            issuer: '',
            jwksUri: '',
            audience: '',
            subjectClaim: 'sub',
            scopeClaim: 'scope',
            authorityMode: 'registry',
            tenantClaim: '',
            allowedTenants: '',
            maxTokenLifetimeS: '3600',
            enabled: 'on',
          },
          discovered: null,
          error: null,
        })
      },
    )

    /**
     * The Test button: read the discovery document and hand the JWKS URI back
     * into the form, without saving. An operator can confirm the issuer URL is
     * right before committing to it — and a mismatched document is refused
     * here rather than becoming a deployment that trusts the wrong keys.
     */
    fastify.post<{ Body: IssuerFormBody }>(
      '/oauth-clients/discover',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const body = request.body ?? {}
        const defaults = { ...body, enabled: body.enabled ?? '' }
        const render = (discovered: { jwksUri: string } | null, error: string | null) =>
          reply.view('oauth-clients/new.ejs', {
            user: request.sessionUser,
            presets: [] as OAuthPresetRecord[],
            defaults,
            discovered,
            error,
          })

        const issuer = (body.issuer ?? '').trim()
        if (!issuer) return render(null, 'Enter an issuer URL first.')
        try {
          const found = await apiClient.discoverOAuthIssuer(token, issuer)
          defaults.jwksUri = found.jwksUri
          return reply.view('oauth-clients/new.ejs', {
            user: request.sessionUser,
            presets: await presetsFor(token),
            defaults,
            discovered: found,
            error: null,
          })
        } catch (err) {
          return reply.view('oauth-clients/new.ejs', {
            user: request.sessionUser,
            presets: await presetsFor(token),
            defaults,
            discovered: null,
            error: apiError(err, 'Could not read the discovery document.'),
          })
        }
      },
    )

    fastify.post<{ Body: IssuerFormBody }>(
      '/oauth-clients',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const b = request.body ?? {}
        const mode = b.authorityMode ?? 'registry'
        const defaults = { ...b, authorityMode: mode, enabled: b.enabled ?? '' }

        const renderError = async (error: string) =>
          reply.view('oauth-clients/new.ejs', {
            user: request.sessionUser,
            presets: await presetsFor(token),
            defaults,
            discovered: null,
            error,
          })

        // Checked here so the operator keeps what they typed and is told which
        // field is at fault, rather than getting the upstream message on an
        // empty form.
        if (!(b.name ?? '').trim()) return renderError('Give the issuer a name.')
        if (!(b.issuer ?? '').trim()) return renderError('Issuer URL is required.')
        if (!(b.jwksUri ?? '').trim()) {
          return renderError(
            'JWKS URI is required — use Test to fill it from the discovery document.',
          )
        }
        if (!(b.audience ?? '').trim()) {
          return renderError(
            'Audience is required. Without it, every token this issuer ever minted for any application would be accepted here.',
          )
        }

        try {
          const created = await apiClient.createOAuthIssuer(token, {
            name: (b.name ?? '').trim(),
            preset: b.preset || 'generic',
            issuer: (b.issuer ?? '').trim(),
            jwksUri: (b.jwksUri ?? '').trim(),
            audience: (b.audience ?? '').trim(),
            subjectClaim: (b.subjectClaim ?? 'sub').trim(),
            scopeClaim: (b.scopeClaim ?? 'scope').trim(),
            authorityMode: mode,
            tenantClaim: (b.tenantClaim ?? '').trim() || null,
            allowedTenants: lines(b.allowedTenants),
            maxTokenLifetimeS: Number(b.maxTokenLifetimeS) || 3600,
            enabled: b.enabled === 'on',
          })
          flashSuccess(reply, `Registered ${created.name}.`)
          return reply.redirect(`/oauth-clients/${created.id}`)
        } catch (err) {
          return renderError(apiError(err, 'Failed to register the issuer.'))
        }
      },
    )

    fastify.get<{ Params: { id: string } }>('/oauth-clients/:id', async (request, reply) => {
      const token = request.sessionUser!.token
      const [detail, tenants] = await Promise.all([
        apiClient.getOAuthIssuer(token, request.params.id).catch(() => null),
        // For the service-account tenant picker. Non-fatal: the view falls
        // back to a typeable id when the list cannot be loaded.
        apiClient.listTenants(token).catch(() => []),
      ])
      if (!detail) {
        return reply.status(404).view('error.ejs', {
          user: request.sessionUser,
          status: 404,
          message: 'No such issuer.',
          requestId: request.id,
        })
      }
      return reply.view('oauth-clients/detail.ejs', {
        user: request.sessionUser,
        issuer: detail.issuer,
        clients: detail.clients,
        rules: detail.rules,
        tenants,
        knownVerticals: VERTICAL_SCOPE_ITEMS,
        safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
      })
    })

    fastify.post<{ Params: { id: string }; Body: IssuerFormBody }>(
      '/oauth-clients/:id',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const b = request.body ?? {}
        const patch: Record<string, unknown> = {
          name: (b.name ?? '').trim(),
          audience: (b.audience ?? '').trim(),
          subjectClaim: (b.subjectClaim ?? '').trim(),
          scopeClaim: (b.scopeClaim ?? '').trim(),
          authorityMode: b.authorityMode,
          tenantClaim: (b.tenantClaim ?? '').trim() || null,
          allowedTenants: lines(b.allowedTenants),
          maxTokenLifetimeS: Number(b.maxTokenLifetimeS) || undefined,
          // An unchecked checkbox sends nothing, so absence means off.
          enabled: b.enabled === 'on',
        }
        try {
          await apiClient.updateOAuthIssuer(token, request.params.id, patch)
          flashSuccess(reply, 'Issuer updated.')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to update the issuer.'))
        }
        return reply.redirect(`/oauth-clients/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/oauth-clients/:id/delete',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        try {
          await apiClient.deleteOAuthIssuer(token, request.params.id)
          flashSuccess(reply, 'Issuer deleted. Tokens from it are no longer accepted.')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to delete the issuer.'))
        }
        return reply.redirect('/oauth-clients')
      },
    )

    fastify.post<{
      Params: { id: string }
      Body: { subject?: string; tenantId?: string; label?: string; scopes?: string | string[] }
    }>(
      '/oauth-clients/:id/clients',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const b = request.body ?? {}
        const scopes = asArray(b.scopes)
        const back = `/oauth-clients/${request.params.id}`

        if (!(b.subject ?? '').trim()) {
          flashError(reply, 'Subject is required — it is how the token names this client.')
          return reply.redirect(back)
        }
        if (scopes.length === 0) {
          flashError(reply, 'Pick at least one scope; a client with none could reach nothing.')
          return reply.redirect(back)
        }
        try {
          await apiClient.createOAuthClient(token, request.params.id, {
            subject: (b.subject ?? '').trim(),
            tenantId: (b.tenantId ?? '').trim() || DEFAULT_TENANT,
            label: (b.label ?? '').trim() || null,
            scopes,
          })
          flashSuccess(reply, 'Service account registered.')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to register the service account.'))
        }
        return reply.redirect(back)
      },
    )

    fastify.post<{
      Params: { id: string }
      Body: { issuerId?: string; subject?: string }
    }>(
      '/oauth-clients/clients/:id/revoke',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        try {
          await apiClient.revokeOAuthClient(token, request.params.id, request.body?.subject)
          flashSuccess(reply, 'Revoked. Any token it still holds stops working on the next call.')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to revoke.'))
        }
        return reply.redirect(`/oauth-clients/${request.body?.issuerId ?? ''}`)
      },
    )

    fastify.post<{
      Params: { id: string }
      Body: { claimValue?: string; grantedScope?: string; priority?: string }
    }>('/oauth-clients/:id/rules', { preHandler: requireRole('admin') }, async (request, reply) => {
      const token = request.sessionUser!.token
      const b = request.body ?? {}
      const back = `/oauth-clients/${request.params.id}`
      if (!(b.claimValue ?? '').trim() || !(b.grantedScope ?? '').trim()) {
        flashError(reply, 'Both the claim value and the scope it grants are required.')
        return reply.redirect(back)
      }
      try {
        await apiClient.createOAuthScopeRule(token, request.params.id, {
          claimValue: (b.claimValue ?? '').trim(),
          grantedScope: (b.grantedScope ?? '').trim(),
          priority: Number(b.priority) || 0,
        })
        flashSuccess(reply, 'Rule added.')
      } catch (err) {
        flashError(reply, apiError(err, 'Failed to add the rule.'))
      }
      return reply.redirect(back)
    })

    fastify.post<{ Params: { id: string }; Body: { issuerId?: string } }>(
      '/oauth-clients/rules/:id/delete',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        try {
          await apiClient.deleteOAuthScopeRule(token, request.params.id)
          flashSuccess(reply, 'Rule removed.')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to remove the rule.'))
        }
        return reply.redirect(`/oauth-clients/${request.body?.issuerId ?? ''}`)
      },
    )
  }
}
