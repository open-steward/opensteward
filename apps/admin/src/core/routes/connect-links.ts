/**
 * Admin UI routes for the Connect Link feature.
 *
 *   GET  /connect-links              list of sessions (active / consumed / expired),
 *                                    spotlighting `?link=<id>` when given
 *   GET  /connect-links/new          create form (search-or-create end-user, optional scope)
 *   POST /connect-links              create — redirects to the list, which shows the
 *                                    link to copy
 *   POST /connect-links/:id/revoke   revoke an active session
 *
 * The actual connect_sessions table lives on integration-server. admin-api
 * proxies; the views here are render-only.
 */
import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { loadEnabledCatalog } from '../proxy/enabled-catalog'
import { backendErrorCode, formatBackendError } from '../proxy/format-backend-error'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'
import { parseSyncScheduleForm } from '../views/sync-schedule'

/** `ConnectSessionStatusSchema` — exactly these three; `expired` is derived
 *  at read time from `consumedAt`/`expiresAt`, not a stored value, but it is
 *  a real status a row can carry even though the view only branches on the
 *  other two. */
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'consumed', label: 'Used' },
  { value: 'expired', label: 'Expired' },
]

/**
 * Which columns of the Connect Links table sort and filter, and on what.
 *
 * Two columns transform their field before rendering it, so their accessor
 * cannot be the bare field — see THE RULE THAT MATTERS MOST in
 * corrected-manifests.md:
 *
 *   - Customer: the cell renders `endUserId ? '👤 ' + slice(0,8) : '—
 *     anonymous'`. `get` falls back to the literal word 'anonymous' so a row
 *     with no customer can still be found by the word actually on screen; the
 *     full id (not the 8-char slice) is kept so a pasted whole id also
 *     matches.
 *   - Tenant: the cell is `include('../_tenant', ...)`, which renders BOTH
 *     the resolved tenant name and its id. `get` reads `tenantLabel`, hoisted
 *     onto each row in the handler below from the same `tenants` list the
 *     view passes to `_tenant.ejs` — so the filter matches either half of
 *     what is rendered, and the two can never drift apart.
 *
 * Scope has no `filter` (sort-only), but its accessor still reproduces the
 * cell's own expression on principle — matching what changes if it is ever
 * promoted to a filterable column.
 *
 * EXPORTED for `admin/tests/journeys/sort-key-cell-parity.test.ts`, which
 * needs the accessors themselves and not just the page they render.
 *
 *   - SCOPE is asserted to EQUAL its cell text exactly. What ordering cannot
 *     see is the SEPARATOR: a joined value is always an extension of its own
 *     first part, so `', '`, `' '` and `'; '` all sort the same way against
 *     that part. (Ordering CAN see a dropped component — the fixture carries
 *     a row holding exactly the first platform of a two-platform row, so
 *     truncating to `allowedPlatforms[0]` ties them and the stable sort
 *     reverses the pair. Two order assertions go red for that. It is only the
 *     separator that needs equality.)
 *   - CUSTOMER is asserted against a DECLARED value per fixture row, because
 *     it deliberately does not equal its cell: the cell shows an emoji and
 *     eight characters, or an em-dashed fallback.
 *
 * TENANT is in neither: `tenantLabel` is hoisted onto the row by the GET
 * handler below, so `get` over a bare fixture row reads `undefined`. It is
 * pinned by ordering and by a filter needle on each half of the label, which
 * is a weaker guarantee — closable by having the test hoist the field the way
 * the handler does.
 */
export const CONNECT_LINKS_TABLE: TableSpec = {
  id: 'links-filters',
  baseUrl: '/connect-links',
  // `?link=<id>` spotlights a just-minted row (see the GET handler below) and
  // must survive a sort or filter, or the banner pointing at it vanishes the
  // moment the operator touches the table.
  preserve: ['link'],
  columns: [
    { key: 'label', header: 'Label', sortable: true, filter: 'text', get: (s: any) => s.label },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      filter: 'text',
      get: (s: any) => s.endUserId ?? 'anonymous',
    },
    {
      key: 'tenant',
      header: 'Tenant',
      sortable: true,
      filter: 'text',
      get: (s: any) => s.tenantLabel,
    },
    {
      key: 'scope',
      header: 'Scope',
      sortable: true,
      get: (s: any) =>
        s.allowedPlatforms.length > 0
          ? s.allowedPlatforms.map((p: any) => `${p.vertical}:${p.slug}`).join(', ')
          : s.allowedVerticals.length > 0
            ? s.allowedVerticals.join(', ')
            : 'any',
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filter: { type: 'enum', options: STATUS_OPTIONS },
      get: (s: any) => s.status,
    },
    { key: 'expires', header: 'Expires', sortable: true, get: (s: any) => s.expiresAt },
    { key: 'actions', header: 'Actions' },
  ],
}

interface CreateBody {
  label?: string
  customerEmail?: string
  customerDisplayName?: string
  endUserId?: string
  vertical?: string
  platform?: string
  redirectUrl?: string
  tenantId?: string
  expiryDays?: string
  /** HTML checkbox value: present (`'on'`) when ticked, absent otherwise. */
  oneTimeOnly?: string
  /**
   * `'platform-default'` (the default), `'read-only'`, or the numeric id of a
   * scope group.
   */
  scopeGroupId?: string
  /** One of `'pinned' | 'customer-picks-adapter' | 'self-register'`. The form
   *  uses this client-side to show/hide fields; the server uses it only to
   *  set `allowSelfRegister` on the underlying session. Mode is otherwise
   *  derived from the combination of email + platform fields. */
  linkMode?: string
  /** `'1'` while `label` is still the autofill's own text, `'0'` once the
   *  operator has typed over it. Never read as an instruction — it is echoed
   *  back into the re-rendered form so the autofill can tell its own output
   *  from the operator's. See `FormValues.labelAutofilled`. */
  labelAutofilled?: string
  /** '' = the deployment default; otherwise a sync mode. See core/views/sync-schedule.ts. */
  syncMode?: string
  syncIntervalValue?: string
  syncIntervalUnit?: string
}

/** The form field an error is about, when there is exactly one. */
type FormField = 'label' | 'vertical' | 'platform' | 'syncSchedule'

/**
 * What the operator submitted, echoed back into the form when it is
 * re-rendered with an error. Every rejection used to render the form EMPTY —
 * ten fields snapped to their defaults, on the screen telling the operator to
 * change one of them — so the customer, tenant, adapter, scopes, expiry and
 * redirect all had to be re-entered from memory before the label could be.
 */
interface FormValues {
  linkMode: string
  label: string
  customerEmail: string
  customerDisplayName: string
  endUserId: string
  tenantId: string
  vertical: string
  platform: string
  scopeGroupId: string
  redirectUrl: string
  expiryDays: string
  oneTimeOnly: boolean
  syncMode: string
  syncIntervalValue: string
  syncIntervalUnit: string
  /**
   * Whether `label` is the autofill's text rather than the operator's.
   *
   * A re-rendered form echoes the submitted label back, and the autofill has
   * no way to tell that text apart from something typed — so it treated every
   * rejection as "the operator owns this field" and switched itself off for
   * the life of the page. The operator then fixed the vertical the error was
   * about and submitted a label still naming no adapter and the wrong minute.
   * The flag rides along so the answer survives the round trip.
   */
  labelAutofilled: boolean
}

function valuesFrom(body: CreateBody): FormValues {
  const s = (v: string | undefined) => (v ?? '').trim()
  return {
    linkMode: s(body.linkMode) || 'pinned',
    label: s(body.label),
    customerEmail: s(body.customerEmail),
    customerDisplayName: s(body.customerDisplayName),
    endUserId: s(body.endUserId),
    tenantId: s(body.tenantId),
    vertical: s(body.vertical),
    platform: s(body.platform),
    scopeGroupId: s(body.scopeGroupId) || 'platform-default',
    redirectUrl: s(body.redirectUrl),
    expiryDays: s(body.expiryDays),
    oneTimeOnly: body.oneTimeOnly === 'on' || body.oneTimeOnly === 'true',
    syncMode: s(body.syncMode),
    syncIntervalValue: s(body.syncIntervalValue),
    syncIntervalUnit: s(body.syncIntervalUnit) || 'hours',
    // Absent means a form that never ran the autofill — no JavaScript, or a
    // POST from something other than the form. Whatever label arrived is then
    // the caller's, which is the safe reading.
    labelAutofilled: s(body.labelAutofilled) === '1',
  }
}

const DEFAULT_TENANT = 'default'
const DEFAULT_EXPIRY_DAYS = 7

/**
 * Deployment-level Connect Link defaults, read from runtime settings so the
 * form can present them. Operators may lack permission to read settings —
 * fall back to the seeded defaults rather than failing the form.
 */
async function loadLinkDefaults(
  apiClient: AdminApiClient,
  token: string,
): Promise<{ expiryHours: number; oneTimeDefault: boolean }> {
  try {
    const rows = await apiClient.listRuntimeSettings(token)
    const expiry = Number(rows.find((r) => r.key === 'connect_link.default_expiry_hours')?.value)
    const oneTime = rows.find((r) => r.key === 'connect_link.one_time_default')?.value
    return {
      expiryHours: Number.isFinite(expiry) && expiry > 0 ? expiry : 72,
      oneTimeDefault: oneTime === true,
    }
  } catch {
    return { expiryHours: 72, oneTimeDefault: false }
  }
}

export function createConnectLinksRoutes(apiClient: AdminApiClient) {
  return async function connectLinksRoutes(fastify: FastifyInstance): Promise<void> {
    // Read is open to any signed-in user; every write below carries its own
    // `requireRole('operator')`. This was a plugin-wide operator gate, which
    // blocked the GETs too — so a viewer saw the Connect section in the nav and
    // got `{"error":"Forbidden — insufficient role"}` from every link in it.
    //
    // The per-route form is deliberate: a new write route is NOT gated by
    // default, so anything added here has to say what it needs. The pages
    // themselves hide actions a viewer cannot take.
    fastify.addHook('preHandler', requireAuth)

    fastify.get<{ Querystring: { link?: string } }>('/connect-links', async (request, reply) => {
      const token = request.sessionUser!.token
      // `?link=<session id>` — which link to spotlight, where the POST below
      // lands after minting. It names a row, the same way `?customer=` and
      // `?template=` do on /connect-links/new; it is not a `?created=1` flag
      // reported back as a message, which `one-feedback-mechanism.test.ts`
      // bans because Back and refresh would replay it.
      //
      // Only the id may travel. It is a randomUUID that authenticates nothing
      // — the customer's link is keyed on the token (`/connect/:token`) — and
      // it is already a URL-borne id via `/connect-links/:id/revoke`, so the
      // address bar learns nothing new. The token must never be here: `req.url`
      // is not redacted from the request log.
      //
      // So the link to copy is resolved server-side instead. integration-server
      // computes `url` from the same resolvePublicBaseUrl the create call used
      // (PUBLIC_BASE_URL > companyInfo.baseUrl > tenant domain), which keeps
      // the absolute URL right even when the admin's own baseUrl is stale.
      const spotlightId = request.query.link?.trim() || null
      const [sessions, templates, companyInfo, spotlight, tenants] = await Promise.all([
        apiClient.listConnectSessions(token),
        apiClient.listConnectLinkTemplates(token).catch(() => []),
        apiClient.getCompanyInfo(token).catch(() => null),
        // Never fatal: a stale or mistyped id degrades to the plain list
        // rather than a broken page.
        spotlightId
          ? apiClient.getConnectSession(token, spotlightId).catch(() => null)
          : Promise.resolve(null),
        // Tenant names for the Tenant column; non-fatal like the rest, the
        // view falls back to the bare tenant id.
        apiClient.listTenants(token).catch(() => []),
      ])
      // tenantLabel combines the resolved tenant name and its id — the same
      // two strings _tenant.ejs renders for this column — so a filter on
      // either half of what's on screen finds the row. See CONNECT_LINKS_TABLE
      // above for why the bare tenantId is not enough.
      const merged = sessions.map((s) => ({
        ...s,
        tenantLabel: [tenants.find((t) => t.id === s.tenantId)?.name, s.tenantId]
          .filter(Boolean)
          .join(' '),
      }))
      const tableState = parseTableQuery(request.query, CONNECT_LINKS_TABLE)
      return reply.view('connect-links/index.ejs', {
        user: request.sessionUser,
        // UNFILTERED — must-fix 7. index.ejs derives two page-chrome values
        // from this SAME local: the "Set your deployment's public URL"
        // warning (computed off every ACTIVE session, not just the ones a
        // table filter happens to match) and the just-created banner's row
        // lookup (`sessions.find(s => s.id === justCreatedSessionId)` — a
        // filter that hides the just-minted row must not also hide its own
        // "copy and send" banner). Passing the filtered array under this name
        // let a table filter silence or wrongly raise the deployment warning,
        // and let `?link=<id>` plus a non-matching filter hide the banner for
        // the link the operator JUST minted.
        sessions: merged,
        // Filtered/sorted — only the table body (`rows` in index.ejs) iterates
        // this.
        rows: applyTableQuery(merged, tableState, CONNECT_LINKS_TABLE),
        templates,
        companyInfo,
        tenants,
        justCreatedSessionId: spotlight?.id ?? null,
        justCreatedUrl: spotlight?.url ?? null,
        tableSpec: CONNECT_LINKS_TABLE,
        tableState,
      })
    })

    fastify.get<{ Querystring: { template?: string; customer?: string } }>(
      '/connect-links/new',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const [{ providers, verticals }, scopeGroups, templates, presetCustomer, linkDefaults] =
          await Promise.all([
            loadEnabledCatalog(apiClient, token),
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listConnectLinkTemplates(token).catch(() => []),
            // `?customer=<id>` — arriving from the Customers list or a customer's
            // own page, where the operator has already chosen who this is for.
            // Resolved server-side so the form is correct before any JavaScript
            // runs, and so a deleted or mistyped id degrades to the blank form
            // rather than a broken one.
            request.query.customer
              ? apiClient.getEndUser(token, request.query.customer).catch(() => null)
              : Promise.resolve(null),
            loadLinkDefaults(apiClient, token),
          ])
        // Only decides whether a tenant control is worth showing; never fatal.
        const tenants = await apiClient.listTenants(token).catch(() => [])
        const noEnabledPlatforms = providers.length === 0
        // Optional template prefill via ?template=<id> from the list page's
        // "Mint from template" select. We resolve server-side so the EJS view
        // can serialize the row; the in-form hydrator JS does the actual
        // field population (one source of truth).
        const tplId = parseInt(request.query?.template ?? '', 10)
        const presetTemplate = !Number.isNaN(tplId)
          ? (templates.find((t) => t.id === tplId) ?? null)
          : null
        return reply.view('connect-links/new.ejs', {
          user: request.sessionUser,
          tenants,
          presetCustomer,
          verticals,
          providers,
          scopeGroups,
          templates,
          presetTemplate,
          noEnabledPlatforms,
          linkDefaults,
          error: null,
        })
      },
    )

    fastify.post<{ Body: CreateBody }>(
      '/connect-links',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const body = request.body ?? ({} as CreateBody)

        /**
         * Re-render the form with the operator's error, keeping the page
         * usable: everything they typed comes back, and `errorField` names the
         * one control the message is about so it can be marked and focused.
         */
        const rejectWith = async (error: string, errorField: FormField | null) => {
          const values = valuesFrom(body)
          const [{ providers, verticals }, scopeGroups, templates, presetCustomer] =
            await Promise.all([
              loadEnabledCatalog(apiClient, token),
              apiClient.listScopeGroups(token).catch(() => []),
              apiClient.listConnectLinkTemplates(token).catch(() => []),
              // The customer the operator had already matched, re-resolved the
              // same way `?customer=` is on the GET, so the form comes back in
              // the state they left it — matched badge, derived tenant and all.
              values.endUserId
                ? apiClient.getEndUser(token, values.endUserId).catch(() => null)
                : Promise.resolve(null),
            ])
          const tenants = await apiClient.listTenants(token).catch(() => [])
          const linkDefaults = await loadLinkDefaults(apiClient, token)
          return reply.view('connect-links/new.ejs', {
            user: request.sessionUser,
            tenants,
            presetCustomer,
            verticals,
            providers,
            scopeGroups,
            templates,
            presetTemplate: null,
            noEnabledPlatforms: providers.length === 0,
            linkDefaults,
            error,
            formValues: values,
            errorField,
          })
        }

        if (!body.label || !body.label.trim()) {
          return rejectWith('Label is required.', 'label')
        }

        // A pinned link sends the customer straight to one adapter's OAuth, so it
        // has to name that adapter. The form marks both fields required in this
        // mode, but the browser is not the authority: both selects lead with an
        // "Any" option, so without this check a submit with neither chosen
        // would mint a link with no allowedVerticals and no allowedPlatforms —
        // an adapter-unrestricted link, from a form that just said those
        // fields were required.
        //
        // Scoped to pinned on purpose: `customer-picks-adapter` and
        // `self-register` exist so the customer chooses, and must stay open.
        if (body.linkMode === 'pinned') {
          if (!body.vertical?.trim()) {
            return rejectWith(
              'Pinned links go straight to one adapter, so a vertical is required.',
              'vertical',
            )
          }
          if (!body.platform?.trim()) {
            return rejectWith(
              'Pinned links go straight to one adapter, so an adapter is required.',
              'platform',
            )
          }
        }
        const tenantId = body.tenantId?.trim() || DEFAULT_TENANT
        const label = body.label.trim()

        // Nothing here checks that the label is free, on purpose. The label the
        // form sends is derived automatically and carries a timestamp, so two
        // links cannot be minted under the same one; and the CONNECTION's label
        // is derived again at completion, where `store.createWithUniqueLabel`
        // suffixes a clash rather than discarding a grant the customer has
        // already given. A lookup here could only refuse a link that would have
        // completed — and could not answer at all for a link that lets the
        // customer pick the adapter, since uniqueness is per platform. The one
        // label refusal left is the far end's; see the catch below.

        const payload: Record<string, unknown> = {
          tenantId,
          label,
        }
        // Blank = "deployment default" — omit expiresAt so integration-server
        // applies the connect_link.default_expiry_hours runtime setting.
        const rawExpiry = (body.expiryDays ?? '').trim()
        if (rawExpiry !== '') {
          const expiryDays = Math.max(1, Math.min(90, Number(rawExpiry) || DEFAULT_EXPIRY_DAYS))
          payload['expiresAt'] = Date.now() + expiryDays * 24 * 60 * 60 * 1000
        }
        if (body.endUserId) payload['endUserId'] = body.endUserId
        else if (body.customerEmail?.trim()) {
          payload['customerEmail'] = body.customerEmail.trim().toLowerCase()
          if (body.customerDisplayName?.trim())
            payload['customerDisplayName'] = body.customerDisplayName.trim()
        }
        if (body.vertical?.trim()) payload['allowedVerticals'] = [body.vertical.trim()]
        if (body.vertical?.trim() && body.platform?.trim()) {
          payload['allowedPlatforms'] = [
            { vertical: body.vertical.trim(), slug: body.platform.trim() },
          ]
        }
        if (body.redirectUrl?.trim()) payload['redirectUrl'] = body.redirectUrl.trim()
        // HTML checkbox: 'on' when ticked; 'true' from a non-browser caller.
        // Sent either way. The form prefills the box from the deployment's
        // `connect_link.one_time_default`, so what it submits is the operator's
        // answer; omitting `false` let integration-server apply that default
        // again, and an unticked box still minted a one-time link — which then
        // refused any sync schedule chosen alongside it.
        const oneTimeOnly = body.oneTimeOnly === 'on' || body.oneTimeOnly === 'true'
        payload['oneTimeOnly'] = oneTimeOnly
        // The schedule the resulting connection starts with. Blank = the
        // deployment default, so nothing is sent. A one-time link always makes
        // a `once` connection — integration-server sets that itself and
        // refuses any other mode — so the selector is not sent with one.
        if (!oneTimeOnly) {
          const parsedSchedule = parseSyncScheduleForm(body)
          if ('error' in parsedSchedule) return rejectWith(parsedSchedule.error, 'syncSchedule')
          if (parsedSchedule.schedule) payload['syncSchedule'] = parsedSchedule.schedule
        }
        if (body.linkMode === 'self-register') {
          payload['allowSelfRegister'] = true
          // Self-register links must not be pre-bound to a customer; the form
          // hides email fields in this mode but defend at the boundary too.
          delete payload['endUserId']
          delete payload['customerEmail']
          delete payload['customerDisplayName']
        }
        // Scope resolution from the selector:
        //   'platform-default' → no override; the platform/dev-app default
        //                        scopes. Also what an absent selector means:
        //                        it is the form's default choice.
        //   'read-only'        → per-platform curated readScopes
        //   <numeric group id> → that scope group's explicit scopes (custom).
        //                        A group that can't be found falls back to
        //                        read-only, the least a deliberate choice
        //                        could have meant.
        if (!body.scopeGroupId || body.scopeGroupId === 'platform-default') {
          payload['scopePolicy'] = 'platform_default'
        } else if (body.scopeGroupId === 'read-only') {
          payload['scopePolicy'] = 'read_only'
        } else {
          const groupId = parseInt(body.scopeGroupId, 10)
          if (!Number.isNaN(groupId)) {
            const groups = await apiClient.listScopeGroups(token).catch(() => [])
            const match = groups.find((g) => g.id === groupId)
            if (match && match.scopes.length > 0) {
              payload['scopes'] = match.scopes
              payload['scopePolicy'] = 'custom'
            } else {
              payload['scopePolicy'] = 'read_only'
            }
          } else {
            payload['scopePolicy'] = 'read_only'
          }
        }

        try {
          const session = await apiClient.createConnectSession(token, payload)
          // POST-Redirect-GET, carrying the session id and nothing else.
          //
          // This used to render the list straight from the POST, to keep the
          // link out of the query string: it embeds a connect token, and
          // `req.url` is not redacted from the request log, so a redirect
          // carrying the link wrote a live credential to stdout, browser
          // history and the address bar. But rendering left the browser's
          // current URL on the POST — a refresh asked to confirm a form
          // resubmission, and confirming minted a second live link.
          //
          // The id keeps both properties. It is a randomUUID that authenticates
          // nothing (only `/connect/:token` opens a link) and it already
          // travels in URLs via `/connect-links/:id/revoke`, so the GET above
          // can re-resolve the link server-side without the token ever being
          // addressable. `connect-link-url.test.ts` guards that invariant;
          // `connect-link-refresh.test.ts` guards this redirect.
          return reply.redirect(`/connect-links?link=${encodeURIComponent(session.id)}`)
        } catch (err) {
          request.log.warn({ err }, 'connect-link create failed')
          // integration-server runs its own label check where it can tell the
          // platform, and answers DUPLICATE_LABEL. Anything else it refuses has
          // no single field to point at.
          return rejectWith(
            formatBackendError(err, 'Failed to create link.'),
            backendErrorCode(err) === 'DUPLICATE_LABEL' ? 'label' : null,
          )
        }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/connect-links/:id/revoke',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.revokeConnectSession(token, request.params.id)
        return reply.redirect('/connect-links')
      },
    )

    // Tiny JSON endpoint used by the new-link form's client-side state
    // machine to learn whether a given adapter ignores per-link scope
    // overrides (bucket-D). Returns just the bits the form needs.
    fastify.get<{ Params: { vertical: string; slug: string } }>(
      '/connect-links/platform-meta/:vertical/:slug',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const meta = await apiClient.getPlatformConfig(
          token,
          request.params.vertical,
          request.params.slug,
        )
        if (!meta) return reply.status(404).send({ error: 'platform-not-found' })
        return {
          data: {
            supportsScopeOverride: meta.supportsScopeOverride !== false,
            recommendedScopes: meta.recommendedScopes ?? null,
            readScopes: meta.readScopes ?? null,
          },
        }
      },
    )
  }
}
