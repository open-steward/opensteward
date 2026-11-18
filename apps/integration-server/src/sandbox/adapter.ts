/**
 * The adapter the sandbox substitutes for a real one.
 *
 * `request.adapter` + `request.credentials` is the single seam every resource
 * router reads — they call `adapter.listInvoices(credentials, params)` and never
 * touch HTTP themselves. Swapping the adapter therefore makes every route in a
 * vertical work with no router changes at all.
 *
 * Substituting HERE rather than registering a synthetic platform in
 * `UnifiedAdapterRegistry` matters for three reasons:
 *
 *  - There is no single outbound-HTTP chokepoint to stub. Each of the ~1,545
 *    adapters owns its own client, some on axios and some on global fetch.
 *    Replacing the object above them sidesteps all of it.
 *  - Nothing enters `adapter/factories.ts` or `platforms/metadata.ts`, so
 *    `check:adapter-parity` is unaffected.
 *  - Real adapters are only instantiated once an operator ENABLES them, so a
 *    fresh clone has none. Bypassing the registry is what lets test mode work
 *    with zero operator setup, which is the point of the feature.
 *
 * A Proxy rather than a generated object so an unlisted method reads as
 * `undefined` and the router answers its existing `501 Not Implemented` — the
 * same thing that happens with a real adapter that lacks the method.
 */
import {
  buildFixture,
  buildFixtures,
  reportUpstreamPage,
  reviveDates,
  SandboxNotFoundError,
  type QueryParams,
  type SandboxStore,
} from '@opensteward/shared'
import type { SandboxResourceSpec } from './manifest'

/**
 * The subset of `QueryParams` the sandbox honours.
 *
 * Values are typed loosely because they arrive that way. Accounting's routers
 * run `parseQueryParams` first, so the sandbox sees numbers; docsign's pass
 * `request.query` through verbatim, so it sees strings. `readList` coerces.
 */
interface SandboxQuery {
  page?: number | string
  limit?: number | string
  search?: string
}

type Verb = 'list' | 'get' | 'create' | 'update' | 'delete' | 'action'

/** Same cap the accounting routers apply in `parseQueryParams`. */
const MAX_LIMIT = 500

export interface SandboxAdapterOptions {
  vertical: string
  /** From the verified API key, never from the request. */
  tenantId: string
  /**
   * Mirrors the connection's slug so `meta.platform` in a response reads the
   * way it does on the live surface.
   */
  platform: string
  store: SandboxStore
  specs: readonly SandboxResourceSpec[]
  version?: string
}

function seedKey(tenantId: string, vertical: string, resourceType: string): string {
  return `${tenantId}|${vertical}|${resourceType}`
}

/**
 * A record's own id, taken from the fixture the schema describes so index 0
 * keeps the documented id (`inv_1042`) and later records derive from it.
 */
function fixtureId(record: Record<string, unknown>, resourceType: string, index: number): string {
  const own = record['id']
  const base = typeof own === 'string' && own.length > 0 ? own : `sbx_${resourceType}`
  return index === 0 ? base : `${base}_${index}`
}

export function createSandboxAdapter(opts: SandboxAdapterOptions): Record<string, unknown> {
  const { vertical, tenantId, platform, store, specs } = opts

  // method name -> (spec, verb). Built once; the Proxy just looks up.
  type ActionSpec = NonNullable<SandboxResourceSpec['actions']>[string]
  const methods = new Map<string, { spec: SandboxResourceSpec; verb: Verb; action?: ActionSpec }>()
  for (const spec of specs) {
    for (const verb of ['list', 'get', 'create', 'update', 'delete'] as const) {
      const name = spec[verb]
      if (name) methods.set(name, { spec, verb })
    }
    // Verbs that are neither CRUD nor a read — docsign's `voidEnvelope`.
    // Without this the Proxy returns undefined and the route 501s forever,
    // silently: no test covers a method the manifest never named.
    for (const action of Object.values(spec.actions ?? {})) {
      methods.set(action.method, { spec, verb: 'action', action })
    }
  }

  /** Seed a resource's records the first time it is read. */
  async function ensureSeeded(spec: SandboxResourceSpec): Promise<void> {
    const existing = await store.list(tenantId, vertical, spec.resourceType)
    if (existing.length > 0) return

    if (spec.singletonId) {
      const record = buildFixture(spec.schema, {
        seed: seedKey(tenantId, vertical, spec.resourceType),
        index: 0,
      })
      await store.upsert(tenantId, vertical, spec.resourceType, spec.singletonId, record)
      return
    }

    const count = spec.seed ?? 3

    // A child resource is seeded once PER PARENT, and stamped with that
    // parent's id. Seeding it standalone would give every record the fixture's
    // documented parent id, so `?envelope_id=` for any envelope but the first
    // would return an empty list — the resource would look broken for two of
    // three envelopes while every schema assertion still passed.
    if (spec.parent) {
      const parentSpec = specs.find((s) => s.resourceType === spec.parent!.resourceType)
      if (!parentSpec) return
      await ensureSeeded(parentSpec)
      const parents = await store.list<Record<string, unknown>>(
        tenantId,
        vertical,
        parentSpec.resourceType,
      )
      for (const parent of parents) {
        const records = buildFixtures(spec.schema, count, {
          seed: seedKey(tenantId, vertical, `${spec.resourceType}|${parent.resourceId}`),
        })
        await store.upsertMany(
          tenantId,
          vertical,
          spec.resourceType,
          records.map((data, index) => {
            const id = `${fixtureId(data, spec.resourceType, index)}_${parent.resourceId}`
            // Stamp the foreign key in the shape the schema already gave it.
            // Projects' users carry `workspaceIds: string[]`, not a scalar, so
            // writing the parent id straight in would produce a record failing
            // its own schema. Taking the shape from the fixture rather than a
            // manifest flag means it cannot drift from the schema, and a
            // vertical that pluralises a foreign key needs no new declaration.
            const existing = data[spec.parent!.foreignKey]
            return {
              id,
              parentId: parent.resourceId,
              data: {
                ...data,
                id,
                [spec.parent!.foreignKey]: Array.isArray(existing)
                  ? [parent.resourceId]
                  : parent.resourceId,
              },
            }
          }),
        )
      }
      return
    }

    const records = buildFixtures(spec.schema, count, {
      seed: seedKey(tenantId, vertical, spec.resourceType),
    })
    await store.upsertMany(
      tenantId,
      vertical,
      spec.resourceType,
      records.map((data, index) => ({
        id: fixtureId(data, spec.resourceType, index),
        data: { ...data, id: fixtureId(data, spec.resourceType, index) },
      })),
    )
  }

  async function read(spec: SandboxResourceSpec, id: string): Promise<Record<string, unknown>> {
    await ensureSeeded(spec)
    const row = await store.get<Record<string, unknown>>(tenantId, vertical, spec.resourceType, id)
    if (!row) throw new SandboxNotFoundError(spec.resourceType, id)
    // JSON.stringify turned every Date into a string on the way in; the
    // canonical schemas want Dates back.
    return reviveDates(spec.schema, row)
  }

  /** A positive integer from a value that may be a number, a string, or junk. */
  function positiveInt(value: number | string | undefined): number | undefined {
    const n = typeof value === 'string' ? Number(value) : value
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
  }

  async function readList(
    spec: SandboxResourceSpec,
    query: SandboxQuery,
    parentId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    await ensureSeeded(spec)
    const rows = await store.list<Record<string, unknown>>(
      tenantId,
      vertical,
      spec.resourceType,
      spec.parent ? parentId : undefined,
    )
    let items = rows.map((r) => reviveDates(spec.schema, r.data))
    if (query.search) {
      const needle = query.search.toLowerCase()
      items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(needle))
    }
    // The sandbox mounts as `passthrough`, so `cachedList` hands the query
    // straight through without its own paging — this is the only place it
    // happens.
    //
    // Coercing matters: docsign's routers pass `request.query` through raw, so
    // `limit` arrives as the STRING '1'. `(page - 1) * limit + limit` would
    // concatenate rather than add — `slice(1, '11')` returning two records
    // for a limit of one.
    const limit = positiveInt(query.limit)
    const page = positiveInt(query.page) ?? 1
    const size = limit === undefined ? items.length : Math.min(limit, MAX_LIMIT)
    const start = (page - 1) * size
    // The whole collection is in hand, so the count and `hasMore` are exact.
    // Nothing else answers them: the router no longer asks for a probe row,
    // and a full page with no report is `hasMore: null`.
    reportUpstreamPage(query as unknown as QueryParams, {
      totalCount: items.length,
      hasMore: start + size < items.length,
    })
    return items.slice(start, start + size)
  }

  /**
   * Merge a request body over a record, keeping only keys the schema declares.
   *
   * Without this the sandbox becomes an arbitrary blob store and an echo
   * oracle: whatever a caller POSTs comes back on the next GET, off-schema.
   * Dropping unknown keys keeps every response shaped like the real thing.
   */
  function mergeKnown(
    spec: SandboxResourceSpec,
    base: Record<string, unknown>,
    body: unknown,
  ): Record<string, unknown> {
    if (!body || typeof body !== 'object') return base
    const shape = (spec.schema as unknown as { shape?: Record<string, unknown> }).shape ?? {}
    const out = { ...base }
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key in shape) out[key] = value
    }
    return out
  }

  /** Apply an action's declared effects to a record, in place of a copy. */
  function applyAction(
    action: ActionSpec | undefined,
    current: Record<string, unknown>,
    body: unknown,
  ): Record<string, unknown> {
    const record = { ...current, ...(action?.sets ?? {}) }
    const data = (body ?? {}) as Record<string, unknown>
    for (const [field, from] of Object.entries(action?.adds ?? {})) {
      const base = Number(record[field] ?? 0)
      const delta = Number(data[from] ?? 0)
      // Clamp: the schemas carrying these fields declare `.min(0)`, so an
      // over-decrement would otherwise write a record failing its own schema.
      if (Number.isFinite(base) && Number.isFinite(delta)) {
        record[field] = Math.max(0, base + delta)
      }
    }
    return record
  }

  function dispatch(spec: SandboxResourceSpec, verb: Verb, action?: ActionSpec) {
    switch (verb) {
      case 'list':
        // Rest args, because the shape depends on the resource: a top-level
        // list is `(credentials, params)` while an envelope-scoped one is
        // `(credentials, envelopeId, params)`. Assuming the last argument is
        // the query would read the parent id as a params object.
        return async (_credentials: unknown, ...rest: unknown[]) => {
          const at = spec.parent?.argIndex ?? -1
          const parentId = at >= 0 ? (rest[at] as string | undefined) : undefined
          const query = (rest[at + 1] ?? {}) as SandboxQuery
          return readList(spec, query, parentId)
        }
      case 'get':
        // A singleton's method takes no id — `getOrganization(credentials)`.
        if (spec.singletonId) return async (_credentials: unknown) => read(spec, spec.singletonId!)
        // `getTrackingEvents(credentials, trackingNumber)` returns an ARRAY:
        // a getter's name over what is really a filtered list. Reading one
        // record by id would return a single event where the live API returns
        // a parcel's whole history.
        if (spec.getReturnsList) {
          const key = spec.getReturnsList.keyField
          return async (_credentials: unknown, value: string) => {
            await ensureSeeded(spec)
            const rows = await store.list<Record<string, unknown>>(
              tenantId,
              vertical,
              spec.resourceType,
            )
            return rows
              .filter((r) => r.data[key] === value)
              .map((r) => reviveDates(spec.schema, r.data))
          }
        }
        return async (_credentials: unknown, id: string) => read(spec, id)
      case 'create':
        return async (_credentials: unknown, data: unknown) => {
          await ensureSeeded(spec)
          const seeded = buildFixture(spec.schema, {
            seed: seedKey(tenantId, vertical, spec.resourceType),
            index: 0,
          })
          const id = `sbx_${randomSuffix()}`
          const record = { ...mergeKnown(spec, seeded, data), id }
          await store.upsert(tenantId, vertical, spec.resourceType, id, record)
          return reviveDates(spec.schema, record)
        }
      case 'update':
        return async (_credentials: unknown, id: string, data: unknown) => {
          const current = await read(spec, id)
          const record = { ...mergeKnown(spec, current, data), id }
          await store.upsert(tenantId, vertical, spec.resourceType, id, record)
          return reviveDates(spec.schema, record)
        }
      case 'delete':
        return async (_credentials: unknown, id: string) => {
          await ensureSeeded(spec)
          const removed = await store.delete(tenantId, vertical, spec.resourceType, id)
          if (!removed) throw new SandboxNotFoundError(spec.resourceType, id)
        }
      case 'action': {
        // A COLLECTION action has no id at all — `adjustInventoryLevel(
        // credentials, { variantId, locationId, delta })` names its target
        // inside the body. Dispatched as the record form, the body would land
        // in the id slot and every call would 404 on an id shaped like an
        // object.
        if (action?.scope === 'collection') {
          const keyBy = action.keyBy ?? []
          return async (_credentials: unknown, data: unknown) => {
            await ensureSeeded(spec)
            const body = (data ?? {}) as Record<string, unknown>
            const rows = await store.list<Record<string, unknown>>(
              tenantId,
              vertical,
              spec.resourceType,
            )
            const hit = keyBy.length
              ? rows.find((r) => keyBy.every((k) => r.data[k] === body[k]))
              : rows[0]
            // Deliberately NOT created on miss. The sandbox knowing which
            // variants and locations exist is the whole point of seeding
            // them; inventing stock for an id it has never heard of would
            // make a typo indistinguishable from a real adjustment.
            if (!hit) {
              throw new SandboxNotFoundError(
                spec.resourceType,
                keyBy.map((k) => `${k}=${String(body[k])}`).join(' ') || 'any',
              )
            }
            const current = reviveDates(spec.schema, hit.data)
            const record = applyAction(action, mergeKnown(spec, current, data), data)
            // `resourceId`, not `id` — a SandboxRow wraps the record, it is
            // not the record.
            record['id'] = hit.resourceId
            await store.upsert(tenantId, vertical, spec.resourceType, hit.resourceId, record)
            return reviveDates(spec.schema, record)
          }
        }
        // Same shape as update — `voidEnvelope(credentials, id, { reason })` —
        // but the action's effects also apply the verb's meaning, so a voided
        // envelope comes back voided rather than unchanged.
        return async (_credentials: unknown, id: string, data: unknown) => {
          const current = await read(spec, id)
          const record = applyAction(action, mergeKnown(spec, current, data), data)
          record['id'] = id
          await store.upsert(tenantId, vertical, spec.resourceType, id, record)
          return reviveDates(spec.schema, record)
        }
      }
    }
  }

  const base: Record<string, unknown> = {
    platform,
    version: opts.version ?? '1.0.0',
    // The sandbox really does filter on `search` (see the `query.search`
    // branch in the list handler above), so it declares the capability. The
    // declaration is what stops the router refusing the parameter, and the
    // sandbox's own cross-cutting "filters by search" tests are what would
    // catch a false claim here.
    capabilities: { search: true },
    // Required on BaseAdapter and unreachable by construction: the sandbox
    // middleware never resolves a credential or runs a refresh. Throwing rather
    // than returning something plausible so a wiring mistake is loud.
    getAuthUrl(): string {
      throw new Error('sandbox adapter: OAuth is not available in test mode')
    },
    exchangeCode(): never {
      throw new Error('sandbox adapter: OAuth is not available in test mode')
    },
    refreshCredentials(): never {
      throw new Error('sandbox adapter: credentials are not refreshable in test mode')
    },
  }

  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)
      if (prop in target) return Reflect.get(target, prop)
      const entry = methods.get(prop)
      // Unlisted -> undefined -> the router's own 501, same as a real adapter
      // that does not implement the method.
      return entry ? dispatch(entry.spec, entry.verb, entry.action) : undefined
    },
    has(target, prop) {
      return typeof prop === 'string' && (prop in target || methods.has(prop))
    },
  })
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}
