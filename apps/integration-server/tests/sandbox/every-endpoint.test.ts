/**
 * Every sandbox endpoint of every mounted vertical, driven over HTTP.
 *
 * `mount.test.ts` proves the wiring on one resource; this proves all of them.
 * It is data-driven from `SANDBOX_RESOURCES`, so a resource added to a manifest
 * is exercised the moment it is declared — and so the same file will cover the
 * remaining verticals as their manifests land, rather than needing a new suite
 * each time.
 *
 * Every response body is validated against its canonical schema. Note the
 * `reviveDates` step: JSON has no Date type, so a `z.date()` field arrives as
 * an ISO string on the live surface too. Parsing the raw wire body would fail
 * identically on both and tell us nothing — a typed client revives first, and
 * so does this.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { sandboxConnectionId, reviveDates } from '@opensteward/shared'
import { SANDBOX_VERTICALS, sandboxSpecsFor } from '../../src/sandbox/manifest'
import type { z } from 'zod'

const TENANT = 'default'

describe.each(SANDBOX_VERTICALS)('every %s sandbox endpoint', (V) => {
  let server: TestServer
  let key: string
  let conn: string

  beforeAll(async () => {
    server = await buildTestServer()
    const minted = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'], mode: 'test' })
    key = minted.plaintext
    conn = sandboxConnectionId(TENANT, V)
  })

  afterAll(async () => {
    await server?.cleanup()
  })

  const call = (method: string, url: string, payload?: Record<string, unknown>) =>
    server.fastify.inject({
      method: method as 'GET',
      url,
      headers: { authorization: `Bearer ${key}` },
      ...(payload === undefined ? {} : { payload }),
    })

  const q = () => `?connection_id=${conn}`
  const parses = (schema: z.ZodType, body: unknown) => schema.safeParse(reviveDates(schema, body))

  /**
   * The URL that lists a resource, resolving a real parent id first when it
   * has one — the way a caller would, rather than assuming a collection route
   * that may not exist.
   *
   * Children are addressed two different ways and the manifest says which.
   * Docsign filters a collection that exists in its own right
   * (`/signers?envelope_id=X`, and 400 without it); payments nests
   * (`/invoices/X/line_items`) and has no `/line_items` collection at all.
   * Building `base() + '&' + queryParam` for the second shape addresses a
   * route that was never registered, so the assertion would 404 against the
   * sweep's own URL rather than test anything.
   */
  /**
   * A resource's route segment, which is not always its `resourceType`.
   * Logistics' tracking events store under `trackingevents` and route at
   * `/tracking-events`; the other eight verticals never distinguished them.
   */
  const seg = (spec: { resourceType: string; path?: string }) => spec.path ?? spec.resourceType

  const listUrl = async (spec: (typeof specs)[number]): Promise<string> => {
    const parent = spec.parent
    if (!parent) return `/test/v1/${V}/${seg(spec)}${q()}`
    // Resolve the parent by the SAME rules, because a parent can have a
    // parent. Projects chains two deep — a comment needs a task, and a task
    // needs a project — so a bare `/tasks` request gets the router's
    // 400 MISSING_PARAM and `[0].id` would be read off an error body.
    const parentId = (await firstOf(parent.resourceType))!
    const parentSeg = seg(specs.find((s) => s.resourceType === parent.resourceType) ?? parent)
    return parent.pathSegment
      ? `/test/v1/${V}/${parentSeg}/${parentId}/${parent.pathSegment}${q()}`
      : `/test/v1/${V}/${seg(spec)}${q()}&${parent.queryParam}=${parentId}`
  }

  /** Every id of a resource, addressed correctly however deep it is nested. */
  const idsOf = async (resourceType: string): Promise<string[]> => {
    const spec = specs.find((s) => s.resourceType === resourceType)
    const url = spec ? await listUrl(spec) : `/test/v1/${V}/${resourceType}${q()}`
    const res = await call('GET', url)
    expect(res.statusCode, `listing ${resourceType} at ${url}`).toBe(200)
    return (res.json() as { data: Array<{ id: string }> }).data.map((r) => r.id)
  }

  const firstOf = async (resourceType: string): Promise<string | undefined> =>
    (await idsOf(resourceType))[0]

  const specs = sandboxSpecsFor(V)
  /**
   * A top-level resource, for the cross-cutting checks that just need any
   * working route. Derived from the manifest rather than a hardcoded resource
   * name, because no resource name exists in every vertical.
   */
  const probe = specs.find((s) => s.list && !s.parent)!
  const probeBase = () => `/test/v1/${V}/${probe.resourceType}`

  /**
   * The HTTP verb this vertical's routers use for an update.
   *
   * Not universal: accounting declares `fastify.put('/invoices/:id')` while
   * crm declares `fastify.patch('/contacts/:id')`, so a hardcoded verb would
   * address a route that does not exist in some verticals.
   *
   * Asked of the route table rather than guessed, so a vertical that picks
   * either verb is covered without another edit here, and a resource with no
   * update route at all reports `null` instead of silently passing.
   */
  const updateVerb = (resourceType: string): 'PUT' | 'PATCH' | null => {
    const url = `/test/v1/${V}/${resourceType}/:id`
    for (const method of ['PUT', 'PATCH'] as const) {
      if (server.fastify.hasRoute({ method, url })) return method
    }
    return null
  }

  /**
   * A URL that really is a write on this vertical, for the scope checks.
   *
   * It has to be a route that EXISTS: the sandbox auth middleware is a
   * preHandler on the plugin's own routes, so an unmatched path 404s before any
   * scope check runs. Accounting has `POST /invoices`; docsign has no create,
   * update or delete anywhere — its only non-GET route is
   * `POST /envelopes/:id/void`.
   */
  /**
   * Whether this vertical has a write route the scope checks can aim at.
   *
   * Stated in the terms `writeTarget` can actually build a URL from — a
   * collection POST, or an action — rather than "declares any mutation", so
   * the two cannot disagree by construction.
   */
  const writable = specs.some((s) => (s.create || s.actions) && !s.parent)

  const writeTarget = async (): Promise<string | null> => {
    const creatable = specs.find((s) => s.create && !s.parent)
    if (creatable) return `/test/v1/${V}/${creatable.resourceType}${q()}`
    const actionable = specs.find((s) => s.actions && !s.parent)
    if (!actionable) return null
    const name = Object.keys(actionable.actions!)[0]!
    const base = `/test/v1/${V}/${actionable.resourceType}`
    const list = (await call('GET', base + q())).json() as { data: Array<{ id: string }> }
    return `${base}/${list.data[0]!.id}/${name}${q()}`
  }

  describe.each(specs.map((s) => [s.resourceType, s] as const))('%s', (_name, spec) => {
    const base = () => `/test/v1/${V}/${seg(spec)}`
    // Rate shopping is POST /rates with the query in the body. `listMethod`
    // says so; everything else is a GET.
    const listVerb = spec.listMethod ?? 'GET'
    const listCall = async (url: string) =>
      listVerb === 'POST' ? call('POST', url, {}) : call('GET', url)

    it.runIf(spec.list)('lists schema-valid records', async () => {
      const res = await listCall(await listUrl(spec))
      expect(res.statusCode).toBe(200)
      const body = res.json() as { data: unknown[]; meta?: { platform?: string } }
      expect(body.data.length).toBeGreaterThan(0)
      // `meta` is per-vertical, not universal: accounting wraps through
      // `listResponse(items, adapter.platform)` while docsign's routers do a
      // bare `reply.send({ data })` — there is no `listResponse` in
      // `docsign/schema/shared.ts` to wrap with. Assert the platform only
      // where the live surface emits one; requiring it everywhere would
      // assert router behavior that does not exist.
      if (body.meta) expect(body.meta.platform).toBeTruthy()
      for (const item of body.data) {
        const r = parses(spec.schema, item)
        expect(r.success, JSON.stringify(r.error?.issues.slice(0, 2))).toBe(true)
      }
      const ids = (body.data as Array<{ id?: string }>).map((i) => i.id)
      expect(ids.every((i) => typeof i === 'string' && i.length > 0)).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it.runIf(spec.get)('gets one schema-valid record', async () => {
      let url = base() + q()
      if (!spec.singletonId) {
        const listRes = await listCall(await listUrl(spec))
        // Guard before indexing: a non-200 list has no `data`, and indexing
        // it throws a TypeError that reads as a suite error rather than a
        // failed assertion.
        expect(listRes.statusCode).toBe(200)
        const list = listRes.json() as { data: Array<Record<string, unknown>> }
        // A list-returning getter is keyed by something that is not the id —
        // `/tracking-events/{trackingNumber}` — so address it by that field.
        const key = spec.getReturnsList
          ? String(list.data[0]![spec.getReturnsList.keyField])
          : String(list.data[0]!['id'])
        url = `${base()}/${key}${q()}`
      }
      const res = await call('GET', url)
      expect(res.statusCode).toBe(200)
      const data = (res.json() as { data: unknown }).data
      // `getTrackingEvents` answers with a parcel's whole history, so validate
      // every element rather than the envelope.
      const records = spec.getReturnsList ? (data as unknown[]) : [data]
      expect(Array.isArray(records) && records.length > 0).toBe(true)
      for (const record of records) {
        const r = parses(spec.schema, record)
        expect(r.success, JSON.stringify(r.error?.issues.slice(0, 2))).toBe(true)
      }
    })

    it.runIf(spec.get && !spec.singletonId && !spec.getReturnsList)(
      '404s an unknown id',
      async () => {
        expect((await call('GET', `${base()}/definitely-not-here${q()}`)).statusCode).toBe(404)
      },
    )

    // The list-returning getter's version of the same question. An unknown
    // tracking number is not an error — it is a parcel with no events yet —
    // so the honest answer is 200 and an empty list, and asserting a 404
    // here would be asserting the wrong contract.
    it.runIf(spec.getReturnsList)('answers an unknown key with an empty list', async () => {
      const res = await call('GET', `${base()}/definitely-not-here${q()}`)
      expect(res.statusCode).toBe(200)
      expect((res.json() as { data: unknown[] }).data).toEqual([])
    })

    it.runIf(spec.create)('creates, and the record reads back', async () => {
      const res = await call('POST', base() + q(), { externalId: 'sweep-1' })
      expect(res.statusCode).toBe(201)
      const created = (res.json() as { data: { id: string } }).data
      const r = parses(spec.schema, created)
      expect(r.success, JSON.stringify(r.error?.issues.slice(0, 2))).toBe(true)
      expect((await call('GET', `${base()}/${created.id}${q()}`)).statusCode).toBe(200)
    })

    it.runIf(spec.update)('updates in place, and 404s an unknown id', async () => {
      const verb = updateVerb(spec.resourceType)
      expect(verb, `${V}/${spec.resourceType} declares update but has no PUT or PATCH`).toBeTruthy()
      const created = (
        (await call('POST', base() + q(), { externalId: 'a' })).json() as { data: { id: string } }
      ).data
      const res = await call(verb!, `${base()}/${created.id}${q()}`, { externalId: 'b' })
      expect(res.statusCode).toBe(200)
      const r = parses(spec.schema, (res.json() as { data: unknown }).data)
      expect(r.success, JSON.stringify(r.error?.issues.slice(0, 2))).toBe(true)
      expect((await call(verb!, `${base()}/nope${q()}`, { externalId: 'c' })).statusCode).toBe(404)
    })

    it.runIf(spec.delete)('deletes once, then 404s', async () => {
      // Delete does not imply create. Payments' payment_methods has
      // `DELETE /payment_methods/:id` (detach) and no collection POST at all,
      // so a create-first strategy 404s on the POST and reads `.id` off an
      // error body. Fall back to a seeded record where there is no create.
      const created = spec.create
        ? (
            (await call('POST', base() + q(), { externalId: 'd' })).json() as {
              data: { id: string }
            }
          ).data
        : ((await call('GET', await listUrl(spec))).json() as { data: Array<{ id: string }> })
            .data[0]!
      expect((await call('DELETE', `${base()}/${created.id}${q()}`)).statusCode).toBe(204)
      expect((await call('GET', `${base()}/${created.id}${q()}`)).statusCode).toBe(404)
      // A second delete must not report success for a record that is gone.
      expect((await call('DELETE', `${base()}/${created.id}${q()}`)).statusCode).toBe(404)
    })

    // Paging is a query-string concern, and a POST list carries its query in
    // the body — logistics' `/rates` router hands the adapter `request.body`,
    // so `?limit=` never reaches it on the live surface either. Asserting
    // paging here would be asserting something the real API does not do.
    it.runIf(spec.list && spec.listMethod !== 'POST')('pages', async () => {
      const url = await listUrl(spec)
      const p1 = (await call('GET', `${url}&limit=1&page=1`)).json() as {
        data: Array<{ id: string }>
      }
      const p2 = (await call('GET', `${url}&limit=1&page=2`)).json() as {
        data: Array<{ id: string }>
      }
      expect(p1.data.length).toBe(1)
      // Assert the SIZE of page two, not just that its first id differs.
      // `limit` arrives as the string '1' from docsign's routers; if it is
      // treated as that string, concatenation (`slice(1, '11')`) returns two
      // records while the id comparison still passes.
      expect(p2.data.length).toBeLessThanOrEqual(1)
      if (p2.data.length > 0) expect(p2.data[0]!.id).not.toBe(p1.data[0]!.id)
    })

    it.runIf(spec.parent)('scopes a child list to its parent', async () => {
      // Addressed through `idsOf`, not a bare collection GET: the parent may
      // itself be nested, which is how projects' comments reach their tasks.
      const parents = await idsOf(spec.parent!.resourceType)
      expect(parents.length).toBeGreaterThan(1)
      const seen = new Map<string, string[]>()
      for (const parentId of parents) {
        const url = spec.parent!.pathSegment
          ? `/test/v1/${V}/${spec.parent!.resourceType}/${parentId}/${spec.parent!.pathSegment}${q()}`
          : `${base()}${q()}&${spec.parent!.queryParam}=${parentId}`
        const res = await call('GET', url)
        expect(res.statusCode, `parent ${parentId}`).toBe(200)
        const rows = (res.json() as { data: Array<Record<string, unknown>> }).data
        // Every parent must have its own children — seeding the child
        // resource standalone would stamp them all with the fixture's
        // documented parent id, so every parent but the first would look
        // empty while the schema assertions still passed.
        expect(rows.length, `parent ${parentId} has no children`).toBeGreaterThan(0)
        for (const row of rows) {
          // A foreign key is not always scalar — projects' users hold
          // `workspaceIds: string[]`. Assert membership when it is a list.
          const fk = row[spec.parent!.foreignKey]
          if (Array.isArray(fk)) expect(fk).toContain(parentId)
          else expect(fk).toBe(parentId)
        }
        seen.set(
          parentId,
          rows.map((r) => String(r['id'])),
        )
      }
      const all = [...seen.values()].flat()
      expect(new Set(all).size, 'children are shared between parents').toBe(all.length)
    })

    // Only a child that filters a real collection can be asked for without a
    // parent. A nested one cannot: `/test/v1/payments/line_items` is not a
    // route, so dropping the parent changes the URL rather than the query,
    // and a 404 from the router would say nothing about parent handling.
    it.runIf(spec.parent?.queryParam)('rejects a child list with no parent id', async () => {
      // The live router owns this 400; the sandbox must not paper over it.
      const res = await call('GET', base() + q())
      expect(res.statusCode).toBe(400)
    })

    it.runIf(spec.actions)('runs an action and persists what it means', async () => {
      const entries = Object.entries(spec.actions!)
      const list = (await call('GET', base() + q())).json() as {
        data: Array<Record<string, unknown> & { id: string }>
      }
      // Per scope. A record-scoped action needs a record of its own; a
      // collection-scoped one addresses whatever its body names, so all of
      // them share the same candidates and one record is enough.
      const perRecord = entries.filter(([, a]) => a.scope !== 'collection')
      expect(list.data.length).toBeGreaterThanOrEqual(Math.max(perRecord.length, 1))

      // Prefer a record that does not ALREADY satisfy `sets`, and don't reuse
      // one between actions.
      //
      // The first half is what makes the assertion mean anything. Fixtures
      // spread enum values across the seeded records, so charges seed as
      // succeeded / cancelled / pending — and a record that already satisfies
      // `sets` makes the assertion vacuous (cancelling an already-cancelled
      // charge holds no matter what the action does), so prefer one that
      // does not.
      //
      // The second half is a guard rather than a demonstrated catch: no
      // current manifest has two actions that would collide on one record.
      // It costs nothing and stops a later vertical from reintroducing the
      // same blind spot by a different route.
      const used = new Set<string>()
      const satisfies = (row: Record<string, unknown>, sets?: Record<string, unknown>) =>
        Object.entries(sets ?? {}).every(([f, v]) => row[f] === v)

      for (const [name, action] of entries) {
        const collectionScoped = action.scope === 'collection'
        // Only a RECORD-scoped action consumes a record. Collection-scoped
        // ones all address whatever their body names, so reserving a record
        // per collection-scoped action would leave the second of ecommerce's
        // two with nothing to pick.
        const pool = collectionScoped ? list.data : list.data.filter((r) => !used.has(r.id))
        const target = pool.find((r) => !satisfies(r, action.sets)) ?? pool[0]!
        if (!collectionScoped) used.add(target.id)
        const id = target.id

        // A collection action has no id in its URL and names its target in
        // the body instead. Send the chosen record's own key fields, so the
        // assertions below are about the record the sweep is watching rather
        // than whichever one the adapter happened to reach for.
        const collection = collectionScoped
        const url = collection ? `${base()}/${name}${q()}` : `${base()}/${id}/${name}${q()}`
        const payload: Record<string, unknown> = {}
        if (collection) {
          for (const k of action.keyBy ?? []) payload[k] = target[k]
          // Give `adds` something to add, so the arithmetic is exercised
          // rather than defaulting to +0 and passing either way.
          for (const from of Object.values(action.adds ?? {})) payload[from] = 1
        }
        const res = await call('POST', url, payload)
        expect(res.statusCode, `${name} on ${collection ? base() : id}`).toBe(200)
        const body = (res.json() as { data: Record<string, unknown> }).data
        const r = parses(spec.schema, body)
        expect(r.success, JSON.stringify(r.error?.issues.slice(0, 2))).toBe(true)
        for (const [field, value] of Object.entries(action.sets ?? {})) {
          expect(body[field], `${name} should set ${field}`).toBe(value)
        }
        // A collection action must have found the record its body named.
        //
        // On its own this proves little: there is one inventory level, so
        // "found by key" and "took the first row" return the same record and
        // replacing the lookup with `rows[0]` passes. The negative case below
        // is what actually holds `keyBy` up — a key matching nothing must not
        // quietly act on some other record.
        for (const k of action.keyBy ?? []) {
          expect(body[k], `${name} acted on the wrong record`).toBe(target[k])
        }
        if ((action.keyBy?.length ?? 0) > 0) {
          const bogus = Object.fromEntries((action.keyBy ?? []).map((k) => [k, `no-such-${k}`]))
          const miss = await call('POST', url, bogus)
          expect(miss.statusCode, `${name} matched a key that exists nowhere`).toBe(404)
        }
        // `adds` is arithmetic, not a literal: +1 on the field it names.
        for (const [field, from] of Object.entries(action.adds ?? {})) {
          expect(body[field], `${name} should add ${from} to ${field}`).toBe(
            Number(target[field]) + 1,
          )
        }
        // And it must stick — an action that returns the right thing but
        // stores the old one is the worst kind of mock.
        const after = (await call('GET', `${base()}/${id}${q()}`)).json() as {
          data: Record<string, unknown>
        }
        for (const [field, value] of Object.entries(action.sets ?? {})) {
          expect(after.data[field], `${name} did not persist ${field}`).toBe(value)
        }
      }
    })
  })

  describe('cross-cutting', () => {
    it('tolerates nonsense paging parameters rather than erroring', async () => {
      for (const bad of ['limit=0', 'limit=-5', 'page=0', 'page=-1', 'limit=abc']) {
        const res = await call('GET', `${probeBase()}${q()}&${bad}`)
        expect(res.statusCode, bad).toBe(200)
      }
    })

    it('treats ?is_live=true as a harmless no-op', async () => {
      // The sandbox mounts as passthrough, so there is no cache to bypass.
      expect((await call('GET', `${probeBase()}${q()}&is_live=true`)).statusCode).toBe(200)
    })

    it('filters by search', async () => {
      // Search on a term taken from the vertical's own seeded data rather than
      // a hardcoded accounting id, so this reads the same for every vertical.
      const all = (await call('GET', `${probeBase()}${q()}`)).json() as {
        data: Array<{ id: string }>
      }
      const needle = all.data[0]!.id
      const res = await call('GET', `${probeBase()}${q()}&search=${needle}`)
      expect(res.statusCode).toBe(200)
      const hits = (res.json() as { data: unknown[] }).data
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((h) => JSON.stringify(h).includes(needle))).toBe(true)
    })

    it('enforces scopes — the sandbox is not a scope-free zone', async () => {
      const readOnly = await server.apiKeys.mint({
        tenantId: TENANT,
        scopes: ['vertical:read'],
        mode: 'test',
      })
      const h = { authorization: `Bearer ${readOnly.plaintext}` }
      const read = await server.fastify.inject({
        method: 'GET',
        url: `${probeBase()}${q()}`,
        headers: h,
      })
      expect(read.statusCode).toBe(200)
      const target = await writeTarget()
      // Cross-check against the manifest rather than just requiring a target.
      // Projects is genuinely read-only — twelve methods and not one of them
      // a write — so simply requiring a target would be wrong. Assert the two
      // AGREE: a manifest that declares a write must yield a target, and a
      // manifest that declares none must not.
      expect(
        Boolean(target),
        `writeTarget disagrees with ${V}'s manifest about whether it can be written to`,
      ).toBe(writable)
      if (!target) return
      const write = await server.fastify.inject({
        method: 'POST',
        url: target!,
        headers: h,
        payload: {},
      })
      expect(write.statusCode).toBe(403)
    })

    it('refuses a key scoped to a different vertical', async () => {
      // Whichever vertical this is, scope the key to a DIFFERENT one. A
      // hardcoded foreign vertical would make this vacuous for the run of
      // that same vertical — it would hand itself a correctly-scoped key and
      // assert it be refused — so pick any vertical other than the one under
      // test.
      const other = SANDBOX_VERTICALS.find((v) => v !== V)
      expect(other, 'need a second sandbox vertical to cross-check scopes').toBeTruthy()
      const foreign = await server.apiKeys.mint({
        tenantId: TENANT,
        scopes: [`vertical:${other}`],
        mode: 'test',
      })
      const res = await server.fastify.inject({
        method: 'GET',
        url: `${probeBase()}${q()}`,
        headers: { authorization: `Bearer ${foreign.plaintext}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it.runIf(writable)('keeps mcp:read read-only in the sandbox', async () => {
      const mcp = await server.apiKeys.mint({
        tenantId: TENANT,
        scopes: ['mcp:read'],
        mode: 'test',
      })
      const target = await writeTarget()
      const res = await server.fastify.inject({
        method: 'POST',
        url: target!,
        headers: { authorization: `Bearer ${mcp.plaintext}` },
        payload: {},
      })
      expect(res.statusCode).toBe(403)
    })
  })
})

describe.each(SANDBOX_VERTICALS)('%s sandbox seeding is deterministic', (V) => {
  it('gives a second, entirely fresh deployment the same ids', async () => {
    // Two operators following the same guide must see the same records, and a
    // restart must not renumber anything a developer has written down.
    const probe = sandboxSpecsFor(V).find((s) => s.list && !s.parent)!
    const ids = async () => {
      const s = await buildTestServer()
      const k = await s.apiKeys.mint({ tenantId: TENANT, scopes: ['*'], mode: 'test' })
      const res = await s.fastify.inject({
        method: 'GET',
        url: `/test/v1/${V}/${probe.resourceType}?connection_id=${sandboxConnectionId(TENANT, V)}`,
        headers: { authorization: `Bearer ${k.plaintext}` },
      })
      const out = (res.json() as { data: Array<{ id: string }> }).data.map((i) => i.id)
      await s.cleanup()
      return out
    }
    expect(await ids()).toEqual(await ids())
  })
})
