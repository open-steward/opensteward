/**
 * The shape of one sandbox resource declaration.
 *
 * Do not move this back into `manifest.ts`, however much it looks like it
 * belongs there.
 *
 * Every vertical's `sandbox/resources.ts` needs this type, and
 * `manifest.ts` imports every vertical. Declaring it there makes
 * CORE -> vertical -> CORE, which a single 18,645-file program resolves
 * without complaint and project references cannot express at all: `tsc -b`
 * stops with TS6202 and the image build fails. Keeping it in a leaf module
 * that imports nothing but `zod` is what lets each vertical compile as its
 * own project — the whole reason the typecheck peaks near 1.3 GB instead of
 * 4.1 GB. `manifest.ts` re-exports the type, so importers outside the
 * verticals are unaffected.
 */
import type { z } from 'zod'

export interface SandboxResourceSpec {
  /** Must equal the router's `RESOURCE` constant — it is the storage key. */
  resourceType: string
  /**
   * The route segment, when it is not the same string as `resourceType`.
   *
   * The two can genuinely differ: logistics' tracking events declare
   * `RESOURCE = 'trackingevents'` and route `/tracking-events`. The constant
   * is the storage key and the path is the URL, so both have to be sayable.
   */
  path?: string
  /**
   * The verb that serves the list, when it is not GET.
   *
   * Logistics' rate shopping is `POST /rates` with the query in the body —
   * `getRates(credentials, params)` returns `Rate[]`, so it IS a list, just
   * not one you can express in a URL. Note the live router hands the adapter
   * the BODY, so `?limit=` never reaches it; paging is not a thing on this
   * route, on the live surface either.
   */
  listMethod?: 'GET' | 'POST'
  /**
   * `get` returns every record matching this field rather than one by id.
   *
   * `getTrackingEvents(credentials, trackingNumber)` returns
   * `TrackingEvent[]`: a `get*` name, a key that is not an id, and a list
   * coming back. It is a filtered list wearing a getter's name, and
   * modelling it as anything else would mean the sandbox returning one event
   * where the live API returns a parcel's whole history.
   */
  getReturnsList?: { keyField: string }
  /** Canonical schema the fixtures are built from and validated against. */
  schema: z.ZodType
  /**
   * Adapter methods this resource exposes. Absent means the sandbox does not
   * implement it and the router's existing `501 Not Implemented` answers —
   * exactly what happens with a real adapter that lacks the method.
   */
  list?: string
  get?: string
  create?: string
  update?: string
  delete?: string
  /**
   * A resource with no id of its own. `getOrganization(credentials)` takes no
   * id argument, and the router stores it under a fixed key — `'self'`, from
   * accounting's `router/organizations.ts`.
   */
  singletonId?: string
  /**
   * A resource that only exists under a parent, where the parent id is a
   * POSITIONAL argument on the list method rather than part of the path:
   * `listSigners(credentials, envelopeId, params)`.
   *
   * `argIndex` counts arguments after `credentials`, zero-based — so the
   * `envelopeId` above is index 0 and `params` is index 1. Getters are
   * unaffected; they take a plain id.
   */
  parent?: {
    /** The `resourceType` of the owning resource, e.g. `'envelopes'`. */
    resourceType: string
    /** Zero-based position of the parent id in the args after `credentials`. */
    argIndex: number
    /**
     * The field on the CHILD record holding the parent's id — `'envelopeId'`.
     * Needed to filter, and not derivable: `'envelopes'` → `'envelopeId'` is
     * the same unrecoverable tokenisation that made this manifest declared
     * rather than inferred.
     */
    foreignKey: string
    /**
     * The query parameter the live router reads — `'envelope_id'`. A fourth
     * independent spelling of the same concept, alongside the router file
     * name, the route path and the `RESOURCE` constant.
     *
     * Set this OR `pathSegment`, never both: they are the two ways a live
     * router can address a child, and which one a vertical picked is not
     * derivable from the adapter signature, which is identical either way.
     */
    queryParam?: string
    /**
     * The trailing segment when the live router NESTS the child under its
     * parent instead of filtering a top-level collection:
     * `GET /invoices/{id}/line_items` → `'line_items'`.
     *
     * Docsign reads its parent from `?envelope_id=` on a collection that
     * exists in its own right; payments has no `/line_items` collection at
     * all. The adapter cannot tell the difference — both arrive as
     * `list*(credentials, parentId, params)` — so only the URL differs, and
     * only callers and the sweep need to know.
     */
    pathSegment?: string
  }
  /**
   * Verbs that are neither CRUD nor a read: keyed by a short name, valued by
   * the adapter method. docsign's `POST /envelopes/:id/void` →
   * `{ void: { method: 'voidEnvelope', sets: { status: 'voided' } } }`.
   *
   * `sets` is applied to the stored record, so the sandbox reflects what the
   * verb means rather than returning it unchanged — a "voided" envelope that
   * still reads `sent` would be a worse lie than a 501.
   */
  actions?: Record<
    string,
    {
      method: string
      /** Record fields set to a literal, e.g. `{ status: 'voided' }`. */
      sets?: Record<string, unknown>
      /**
       * Record field ← record field PLUS a numeric field from the request
       * body: `{ available: 'delta' }` means `available += body.delta`.
       *
       * Only ecommerce's `adjustInventoryLevel` needs this, and one adapter
       * method is thin grounds for a manifest concept. It earns its place
       * because the delta IS the verb's meaning: without it `adjust` returns
       * the record unchanged, which is a more convincing lie than a 501 —
       * the same reason `sets` exists at all. Clamped at zero, because the
       * schemas that carry these fields declare `.min(0)`.
       */
      adds?: Record<string, string>
      /**
       * `'record'` (the default) — `POST /{resource}/{id}/{name}`, dispatched
       * as `method(credentials, id, data)`.
       *
       * `'collection'` — `POST /{resource}/{name}`, dispatched as
       * `method(credentials, data)`. Ecommerce's inventory levels are the
       * only ones so far: `POST /inventory_levels/adjust` names its target
       * inside the body rather than in the path, so there is no id argument
       * at all and the body would otherwise land in the id slot.
       */
      scope?: 'record' | 'collection'
      /**
       * For a collection action: the body fields that identify which record
       * it acts on — `['variantId', 'locationId']`.
       *
       * Not inferable. Matching on every body field that is also a schema
       * field works for `adjust` only by the accident that `delta` is not
       * one, and breaks outright for `set`, whose `available` is both a
       * schema field and the value being changed.
       */
      keyBy?: readonly string[]
    }
  >
  /** How many records to seed on first read. Ignored for singletons. */
  seed?: number
}
