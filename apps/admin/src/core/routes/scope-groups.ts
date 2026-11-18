/**
 * Admin UI for operator-defined scope groups.
 *
 *   GET   /scope-groups               list (operator+)
 *   GET   /scope-groups/new           create form (operator+)
 *   POST  /scope-groups               create (operator+)
 *   GET   /scope-groups/:id/edit      edit form (operator+)
 *   POST  /scope-groups/:id           update (operator+)
 *   POST  /scope-groups/:id/delete    delete (operator+)
 *
 * Groups are stored in admin-api's SQLite, scoped per (vertical, platform).
 * They surface on the per-platform configure page as one-click bundles
 * above the standard scope catalog.
 */
import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashSuccess } from '../flash'
import type { AdminApiClient, TaggedPlatform } from '../proxy/admin-api-client'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'
import { KNOWN_VERTICALS } from '../verticals'

/**
 * Which columns of the scope-groups table sort and filter, and on what.
 *
 * Built per-request, not module-level, because the Platform column's enum
 * options come from the provider catalog — the same list the deleted
 * above-table form's cascading `<select>` populated from. Vertical and
 * Platform stay ENUM filters rather than free text specifically so that
 * cascade survives the absorption: see corrected-manifests.md's "/scope-groups
 * is NOT a plain filter form" ruling. Both accessors read the bare field —
 * the cell renders `g.vertical` / `g.platform` directly (index.ejs:82-85), no
 * label transform to reproduce.
 */
function scopeGroupsTable(providers: TaggedPlatform[]): TableSpec {
  const platformOptions = providers
    .slice()
    // Same sort the deleted cascade script used, so the enum's option order
    // matches what an operator with JavaScript disabled — or before the
    // cascade script narrows it — already sees.
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.slug, label: `${p.name} (${p.slug})` }))
  return {
    id: 'scope-groups-filters',
    baseUrl: '/scope-groups',
    columns: [
      {
        key: 'vertical',
        header: 'Vertical',
        sortable: true,
        filter: { type: 'enum', options: KNOWN_VERTICALS.map((v) => ({ value: v, label: v })) },
        legacy: 'vertical',
        get: (g: any) => g.vertical,
      },
      {
        key: 'platform',
        header: 'Platform',
        sortable: true,
        filter: { type: 'enum', options: platformOptions },
        legacy: 'platform',
        get: (g: any) => g.platform,
      },
      { key: 'name', header: 'Name', sortable: true, filter: 'text', get: (g: any) => g.name },
      // Sort-only: the cell renders the scope names themselves, one per
      // line, not a count — exempt from THE RULE, which only binds a column
      // that carries a filter box.
      { key: 'scopes', header: 'Scopes', sortable: true, get: (g: any) => g.scopes.length },
      { key: 'created', header: 'Created', sortable: true, get: (g: any) => g.createdAt },
      { key: 'actions', header: '' },
    ],
  }
}

export function createScopeGroupsRoutes(apiClient: AdminApiClient) {
  return async function scopeGroupsRoutes(fastify: FastifyInstance): Promise<void> {
    // Read is open to any signed-in user; every write below carries its own
    // `requireRole('operator')`. This was a plugin-wide operator gate, which
    // blocked the GETs too — so a viewer saw the Connect section in the nav and
    // got `{"error":"Forbidden — insufficient role"}` from every link in it.
    //
    // The per-route form is deliberate: a new write route is NOT gated by
    // default, so anything added here has to say what it needs. The pages
    // themselves hide actions a viewer cannot take.
    fastify.addHook('preHandler', requireAuth)

    fastify.get('/scope-groups', async (request, reply) => {
      const token = request.sessionUser!.token
      // `listCatalog` stays best-effort, deliberately. It only seeds the enum
      // options behind the Platform filter and the cascade script's PROVIDERS
      // payload; the groups table renders correctly without it. It also
      // resolves through admin-api to integration-server, so propagating
      // would let an unrelated service take out a page whose own data is
      // intact. Its siblings on /scope-groups/new and the create-error
      // re-render catch it for the same reason.
      const providers = await apiClient.listCatalog(token).catch(() => [])
      const table = scopeGroupsTable(providers)
      const tableState = parseTableQuery(request.query, table)
      const filter = {
        vertical: tableState.filters.vertical || undefined,
        platform: tableState.filters.platform || undefined,
      }
      // `listScopeGroups` is NOT `.catch(() => [])`: an empty array there
      // renders the page's "no groups yet" empty state, so a down admin-api
      // told the operator their scope groups were gone. Let it throw —
      // server.ts's handler shows the upstream status and the operator knows
      // to look at the API, not at who deleted their groups.
      const groups = await apiClient.listScopeGroups(token, filter)
      return reply.view('scope-groups/index.ejs', {
        user: request.sessionUser,
        groups: applyTableQuery(groups, tableState, table),
        providers,
        tableSpec: table,
        tableState,
      })
    })

    fastify.get<{ Querystring: { vertical?: string; platform?: string } }>(
      '/scope-groups/new',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const providers = await apiClient.listCatalog(token).catch(() => [])
        return reply.view('scope-groups/edit.ejs', {
          user: request.sessionUser,
          mode: 'create',
          group: null,
          defaults: {
            vertical: request.query.vertical ?? '',
            platform: request.query.platform ?? '',
            name: '',
            scopes: '',
          },
          verticals: KNOWN_VERTICALS,
          providers,
          error: null,
        })
      },
    )

    fastify.post<{
      Body: { vertical?: string; platform?: string; name?: string; scopes?: string }
    }>('/scope-groups', { preHandler: [requireRole('operator')] }, async (request, reply) => {
      const token = request.sessionUser!.token
      const vertical = (request.body?.vertical ?? '').trim()
      const platform = (request.body?.platform ?? '').trim()
      const name = (request.body?.name ?? '').trim()
      const scopes = parseScopesText(request.body?.scopes ?? '')

      const renderError = async (msg: string) => {
        const providers = await apiClient.listCatalog(token).catch(() => [])
        return reply.view('scope-groups/edit.ejs', {
          user: request.sessionUser,
          mode: 'create',
          group: null,
          defaults: { vertical, platform, name, scopes: request.body?.scopes ?? '' },
          verticals: KNOWN_VERTICALS,
          providers,
          error: msg,
        })
      }

      if (!vertical || !KNOWN_VERTICALS.includes(vertical as (typeof KNOWN_VERTICALS)[number])) {
        return renderError('Pick a vertical.')
      }
      if (!platform) return renderError('Adapter is required.')
      if (!name) return renderError('Group name is required.')
      if (scopes.length === 0) return renderError('Add at least one scope.')

      try {
        await apiClient.createScopeGroup(token, { vertical, platform, name, scopes })
        flashSuccess(reply, 'Scope group created.')
        return reply.redirect('/scope-groups')
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Failed to create group.'
        return renderError(message)
      }
    })

    fastify.get<{ Params: { id: string } }>('/scope-groups/:id/edit', async (request, reply) => {
      const token = request.sessionUser!.token
      const id = parseInt(request.params.id, 10)
      if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
      // `listScopeGroups` uncaught for the same reason: `[]` makes `find`
      // miss, and the 404 below then says the group is not there — which is a
      // different fact from "we could not ask". Only a successful list may
      // produce that 404. `listCatalog` stays best-effort, matching
      // /scope-groups/new, which renders the same edit.ejs form.
      const [groups, providers] = await Promise.all([
        apiClient.listScopeGroups(token),
        apiClient.listCatalog(token).catch(() => []),
      ])
      const group = groups.find((g) => g.id === id)
      if (!group) return reply.status(404).send({ error: 'Scope group not found' })
      return reply.view('scope-groups/edit.ejs', {
        user: request.sessionUser,
        mode: 'edit',
        group,
        defaults: {
          vertical: group.vertical,
          platform: group.platform,
          name: group.name,
          scopes: group.scopes.join(', '),
        },
        verticals: KNOWN_VERTICALS,
        providers,
        error: null,
      })
    })

    fastify.post<{ Params: { id: string }; Body: { name?: string; scopes?: string } }>(
      '/scope-groups/:id',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const name = (request.body?.name ?? '').trim()
        const scopes = parseScopesText(request.body?.scopes ?? '')
        if (!name || scopes.length === 0) {
          const [groups, providers] = await Promise.all([
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listCatalog(token).catch(() => []),
          ])
          const group = groups.find((g) => g.id === id)
          return reply.view('scope-groups/edit.ejs', {
            user: request.sessionUser,
            mode: 'edit',
            group: group ?? null,
            defaults: {
              vertical: group?.vertical ?? '',
              platform: group?.platform ?? '',
              name,
              scopes: request.body?.scopes ?? '',
            },
            verticals: KNOWN_VERTICALS,
            providers,
            error: 'Name and at least one scope are required.',
          })
        }
        try {
          await apiClient.updateScopeGroup(token, id, { name, scopes })
          flashSuccess(reply, 'Scope group updated.')
          return reply.redirect('/scope-groups')
        } catch (err) {
          const message =
            err instanceof Error && err.message ? err.message : 'Failed to update group.'
          const [groups, providers] = await Promise.all([
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listCatalog(token).catch(() => []),
          ])
          const group = groups.find((g) => g.id === id)
          return reply.view('scope-groups/edit.ejs', {
            user: request.sessionUser,
            mode: 'edit',
            group: group ?? null,
            defaults: {
              vertical: group?.vertical ?? '',
              platform: group?.platform ?? '',
              name,
              scopes: request.body?.scopes ?? '',
            },
            verticals: KNOWN_VERTICALS,
            providers,
            error: message,
          })
        }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/scope-groups/:id/delete',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        // Uncaught: a success flash reads "Scope group deleted.", so
        // swallowing here told the operator a group was gone while it was
        // still live on every connect link that references it.
        await apiClient.deleteScopeGroup(token, id)
        flashSuccess(reply, 'Scope group deleted.')
        return reply.redirect('/scope-groups')
      },
    )
  }
}

function parseScopesText(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
}
