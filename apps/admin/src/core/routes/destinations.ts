/**
 * Destinations — scheduled exports of the stored records to the operator's
 * lake or warehouse.
 *
 *   GET  /destinations                      list with status and last run
 *   GET  /destinations/new?type=            create form, generated from the type catalog
 *   POST /destinations                      create
 *   GET  /destinations/:id                  detail: settings, actions, run history
 *   POST /destinations/:id/settings         name / interval / enabled / PII
 *   POST /destinations/:id/test             connection test
 *   POST /destinations/:id/run              run now
 *   POST /destinations/:id/backfill         reset cursors and re-export
 *   POST /destinations/:id/credentials      replace the secrets
 *   POST /destinations/:id/delete           delete
 *
 * Every page needs `destinations:manage`; the include-PII control is offered
 * only to `data:read_pii` holders. admin-api enforces both, and
 * integration-server keeps each destination inside the user's tenant scope —
 * this UI only decides what to offer, and shows the upstream refusal
 * (`SCOPE_EXCEEDS_CALLER`, `PII_NOT_PERMITTED`, `HOST_NOT_ALLOWED`, …) when
 * one comes back.
 *
 * Secrets are write-only: secret fields render as empty password inputs,
 * are never echoed back into a re-rendered form, and the API only ever
 * reports which of them are set.
 *
 * Served with the strict CSP (`../csp.ts`): no inline script anywhere here.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasPermission, requirePermission } from '../auth/middleware'
import { useStrictCsp } from '../csp'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient } from '../proxy/admin-api-client'
import type {
  DestinationInput,
  DestinationRecord,
  DestinationTypeRecord,
  JsonSchemaObject,
  JsonSchemaProperty,
} from '../proxy/data-platform-types'
import {
  describeScope,
  scopeFromForm,
  scopePickerModel,
  type ScopeSelection,
} from '../scope-picker'
import { KNOWN_VERTICALS, VERTICAL_LABELS } from '../verticals'

type Form = Record<string, string | string[] | undefined>

const CONFIG_PREFIX = 'cfg_'
const SECRET_PREFIX = 'sec_'
const DEFAULT_INTERVAL_MIN = 60

function one(v: string | string[] | undefined): string {
  const l = Array.isArray(v) ? v : v === undefined ? [] : [v]
  return (l[l.length - 1] ?? '').trim()
}

function status(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

export interface UpstreamRefusal {
  code: string | null
  message: string
  details: string[]
}

export function upstreamRefusal(
  err: unknown,
  fallback = 'The request was refused.',
): UpstreamRefusal {
  const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (typeof raw === 'string') return { code: null, message: raw, details: [] }
  if (raw && typeof raw === 'object') {
    const e = raw as { code?: unknown; message?: unknown; details?: unknown }
    const details = Array.isArray(e.details)
      ? e.details.map((d) => {
          if (d && typeof d === 'object') {
            const i = d as { path?: unknown; message?: unknown }
            const path = typeof i.path === 'string' && i.path ? `${i.path}: ` : ''
            return `${path}${typeof i.message === 'string' ? i.message : JSON.stringify(d)}`
          }
          return String(d)
        })
      : []
    return {
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message : fallback,
      details,
    }
  }
  return { code: null, message: fallback, details: [] }
}

function refusalText(r: UpstreamRefusal): string {
  const base = r.code ? `${r.message} (${r.code})` : r.message
  return r.details.length > 0 ? `${base} — ${r.details.join('; ')}` : base
}

// ── Form generation from the type catalog's JSON Schema ─────────────────

export interface FormField {
  /** Form input name: `cfg_<path>` / `sec_<path>`, nested keys dotted (`cfg_stage.url`). */
  name: string
  /** Dotted path inside the config / secrets object. */
  key: string
  label: string
  kind: 'text' | 'number' | 'checkbox' | 'select' | 'password' | 'textarea'
  required: boolean
  description: string | null
  options: string[]
  value: string
  checked: boolean
  placeholder: string
}

/** A fieldset: the top-level scalars (key null), or one nested object. */
export interface FormGroup {
  key: string | null
  label: string | null
  description: string | null
  required: boolean
  fields: FormField[]
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function typesOf(p: JsonSchemaProperty): string[] {
  const own = Array.isArray(p.type) ? p.type : p.type ? [p.type] : []
  const fromAny = (p.anyOf ?? []).flatMap((b) => typesOf(b))
  return [...own, ...fromAny]
}

function enumOf(p: JsonSchemaProperty): string[] | null {
  if (Array.isArray(p.enum)) return p.enum.map(String)
  for (const b of p.anyOf ?? []) if (Array.isArray(b.enum)) return b.enum.map(String)
  return null
}

/** The object schema a property describes (directly or as an `anyOf` branch), or null. */
function objectOf(p: JsonSchemaProperty): JsonSchemaObject | null {
  if (p.properties) return p
  for (const b of p.anyOf ?? []) if (b.properties) return b
  return null
}

function valueAt(values: Record<string, unknown> | undefined, path: string[]): unknown {
  let cur: unknown = values
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

/** Flat secret keys that belong to a loader's staging store (`stageAccessKeyId`, …). */
const STAGE_SECRET = /^(stage|storage)[A-Z]/

/**
 * Fieldsets for a type's config (or secrets) schema: one for the top-level
 * scalars, one per nested object (recursively, keys dotted). Enums render as
 * a select, booleans as a checkbox, numbers as a number input, strings as
 * text; every secret field as an empty password input (a textarea for JSON or
 * PEM keys), never pre-filled. Flat staging credentials of the warehouse
 * loaders (`stage…`) get a fieldset of their own.
 */
export function groupsFromSchema(
  schema: JsonSchemaObject | null,
  opts: { secret: boolean; values?: Record<string, unknown> },
): FormGroup[] {
  const prefix = opts.secret ? SECRET_PREFIX : CONFIG_PREFIX
  const groups: FormGroup[] = []

  function field(path: string[], p: JsonSchemaProperty, required: boolean): FormField {
    const key = path.join('.')
    const leaf = path[path.length - 1]!
    const types = typesOf(p)
    const options = enumOf(p)
    const stored = valueAt(opts.values, path)
    const initial = stored !== undefined ? stored : p.default
    let kind: FormField['kind']
    if (opts.secret) kind = /json|privatekey$/i.test(leaf) ? 'textarea' : 'password'
    else if (options) kind = 'select'
    else if (types.includes('boolean')) kind = 'checkbox'
    else if (types.includes('number') || types.includes('integer')) kind = 'number'
    else kind = 'text'
    return {
      name: `${prefix}${key}`,
      key,
      label: humanize(leaf),
      kind,
      required,
      description: p.description ?? null,
      options: options ?? [],
      // Secrets are write-only: never rendered back, not even after an error.
      value: opts.secret || initial === undefined || initial === null ? '' : String(initial),
      checked: kind === 'checkbox' && initial === true,
      placeholder:
        !opts.secret && p.default !== undefined && typeof p.default !== 'object'
          ? String(p.default)
          : '',
    }
  }

  function walk(
    obj: JsonSchemaObject | null,
    path: string[],
    group: FormGroup,
    parentRequired: boolean,
  ) {
    const required = new Set(obj?.required ?? [])
    const stage: FormField[] = []
    for (const [key, p] of Object.entries(obj?.properties ?? {})) {
      const isRequired = parentRequired && required.has(key)
      const nested = objectOf(p)
      if (nested) {
        const child: FormGroup = {
          key: [...path, key].join('.'),
          label: humanize(key),
          description: p.description ?? nested.description ?? null,
          required: isRequired,
          fields: [],
        }
        groups.push(child)
        walk(nested, [...path, key], child, isRequired)
        continue
      }
      const f = field([...path, key], p, isRequired)
      if (opts.secret && path.length === 0 && STAGE_SECRET.test(key)) stage.push(f)
      else group.fields.push(f)
    }
    if (stage.length > 0) {
      groups.push({
        key: 'stage-credentials',
        label: 'Staging store credentials',
        description: 'Only the ones for the staging store type you picked are used.',
        required: false,
        fields: stage,
      })
    }
  }

  const top: FormGroup = { key: null, label: null, description: null, required: true, fields: [] }
  groups.push(top)
  walk(schema, [], top, true)
  return groups.filter((g) => g.fields.length > 0)
}

/** Every field of {@link groupsFromSchema}, flattened. */
export function fieldsFromSchema(
  schema: JsonSchemaObject | null,
  opts: { secret: boolean; values?: Record<string, unknown> },
): FormField[] {
  return groupsFromSchema(schema, opts).flatMap((g) => g.fields)
}

function readObject(
  obj: JsonSchemaObject | null,
  body: Form,
  prefix: string,
  path: string[],
  secret: boolean,
): { value: Record<string, unknown>; touched: boolean } {
  const out: Record<string, unknown> = {}
  let touched = false
  const required = new Set(obj?.required ?? [])
  for (const [key, p] of Object.entries(obj?.properties ?? {})) {
    const nested = objectOf(p)
    if (nested) {
      const child = readObject(nested, body, prefix, [...path, key], secret)
      // An optional nested object left entirely blank is left out.
      if (child.touched || (required.has(key) && !secret)) out[key] = child.value
      touched ||= child.touched
      continue
    }
    const rawValue = body[`${prefix}${[...path, key].join('.')}`]
    const raw = (Array.isArray(rawValue) ? rawValue[rawValue.length - 1] : rawValue)?.trim() ?? ''
    const types = typesOf(p)
    if (!secret && !enumOf(p) && types.includes('boolean')) {
      const on = raw === 'on' || raw === 'true' || raw === '1'
      out[key] = on
      touched ||= on
      continue
    }
    if (raw === '') continue
    touched = true
    if (!secret && (types.includes('number') || types.includes('integer'))) {
      const n = Number(raw)
      out[key] = Number.isFinite(n) ? n : raw
      continue
    }
    out[key] = raw
  }
  return { value: out, touched }
}

/** The `config` object a form post describes, typed by the schema; dotted names nest. */
export function configFromForm(
  schema: JsonSchemaObject | null,
  body: Form,
): Record<string, unknown> {
  return readObject(schema, body, CONFIG_PREFIX, [], false).value
}

/** Secret values from a form post; blank fields are left out, dotted names nest. */
export function secretsFromForm(
  schema: JsonSchemaObject | null,
  body: Form,
): Record<string, unknown> {
  return readObject(schema, body, SECRET_PREFIX, [], true).value
}

function destinationScope(sel: ScopeSelection, maskFinancial: boolean): DestinationInput['scope'] {
  const scope: DestinationInput['scope'] = { tenants: sel.tenants }
  if (sel.verticals.length > 0) {
    scope.verticals = Object.fromEntries(sel.verticals.map((v) => [v, '*' as const]))
  }
  if (maskFinancial) scope.maskFinancial = true
  return scope
}

function intervalFrom(body: Form): number | undefined {
  const raw = one(body['interval_min'])
  if (raw === '') return undefined
  const n = Math.round(Number(raw))
  return Number.isFinite(n) ? n * 60 : undefined
}

export function formatInterval(sec: number): string {
  if (sec % 86_400 === 0) return `every ${sec / 86_400} day${sec === 86_400 ? '' : 's'}`
  if (sec % 3600 === 0) return `every ${sec / 3600} hour${sec === 3600 ? '' : 's'}`
  if (sec % 60 === 0) return `every ${sec / 60} min`
  return `every ${sec} s`
}

export function createDestinationsRoutes(apiClient: AdminApiClient) {
  return async function destinationsRoutes(fastify: FastifyInstance): Promise<void> {
    useStrictCsp(fastify)
    fastify.addHook('preHandler', requirePermission('destinations:manage'))

    function notFound(request: FastifyRequest, reply: FastifyReply) {
      return reply.status(404).view('error.ejs', {
        user: request.sessionUser,
        status: 404,
        message: 'No such destination, or it is outside your scope.',
        requestId: null,
      })
    }

    async function renderNew(
      request: FastifyRequest,
      reply: FastifyReply,
      opts: {
        types: DestinationTypeRecord[]
        type: DestinationTypeRecord | null
        body?: Form
        selected?: ScopeSelection
        error?: UpstreamRefusal | null
        statusCode?: number
      },
    ) {
      const user = request.sessionUser!
      const picker = await scopePickerModel(apiClient, user)
      const body = opts.body ?? {}
      const values = opts.body ? configFromForm(opts.type?.configSchema ?? null, body) : undefined
      return reply.status(opts.statusCode ?? 200).view('destinations/new.ejs', {
        user,
        types: opts.types,
        type: opts.type,
        configGroups: groupsFromSchema(opts.type?.configSchema ?? null, { secret: false, values }),
        secretGroups: groupsFromSchema(opts.type?.secretsSchema ?? null, { secret: true }),
        picker,
        selected: opts.selected ?? { tenants: picker.allowAll ? '*' : [], verticals: [] },
        form: {
          name: one(body['name']),
          intervalMin: one(body['interval_min']) || String(DEFAULT_INTERVAL_MIN),
          enabled: opts.body ? one(body['enabled']) === 'on' : true,
          includePii: one(body['include_pii']) === 'on',
          maskFinancial: one(body['mask_financial']) === 'on',
        },
        canReadPii: hasPermission(user, 'data:read_pii'),
        error: opts.error ?? null,
        title: 'New destination',
      })
    }

    fastify.get('/destinations', async (request, reply) => {
      const token = request.sessionUser!.token
      let destinations: DestinationRecord[] = []
      let disabled = false
      try {
        destinations = await apiClient.listDestinations(token)
      } catch (err) {
        if (status(err) !== 409) throw err
        disabled = true
      }
      const types = await apiClient.listDestinationTypes(token).catch(() => [])
      const labels = Object.fromEntries(types.map((t) => [t.type, t.label]))
      return reply.view('destinations/index.ejs', {
        user: request.sessionUser,
        destinations: destinations.map((d) => ({
          ...d,
          typeLabel: labels[d.type] ?? d.type,
          scopeText: describeScope(d.scope?.tenants ?? [], d.scope?.verticals),
          intervalText: formatInterval(d.intervalSec),
        })),
        disabled,
      })
    })

    fastify.get<{ Querystring: Form }>('/destinations/new', async (request, reply) => {
      const types = await apiClient.listDestinationTypes(request.sessionUser!.token)
      const wanted = one(request.query?.['type'])
      const available = types.filter((t) => t.available)
      const type = available.find((t) => t.type === wanted) ?? available[0] ?? null
      return renderNew(request, reply, { types, type })
    })

    fastify.post<{ Body: Form }>('/destinations', async (request, reply) => {
      const user = request.sessionUser!
      const body = request.body ?? {}
      const types = await apiClient.listDestinationTypes(user.token)
      const type = types.find((t) => t.type === one(body['type']) && t.available) ?? null
      if (!type) {
        return renderNew(request, reply, {
          types,
          type: types.find((t) => t.available) ?? null,
          body,
          error: { code: 'UNSUPPORTED_TYPE', message: 'Pick a destination type.', details: [] },
          statusCode: 400,
        })
      }
      const picker = await scopePickerModel(apiClient, user)
      const { selection, error: scopeError } = scopeFromForm(body, picker)
      const name = one(body['name'])
      const fail = (message: string, code: string | null = null) =>
        renderNew(request, reply, {
          types,
          type,
          body,
          selected: selection,
          error: { code, message, details: [] },
          statusCode: 400,
        })
      if (!name) return fail('Give the destination a name.')
      if (scopeError) return fail(scopeError)

      const canReadPii = hasPermission(user, 'data:read_pii')
      const secrets = secretsFromForm(type.secretsSchema, body)
      const input: DestinationInput = {
        name,
        type: type.type,
        config: configFromForm(type.configSchema, body),
        ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
        scope: destinationScope(selection, one(body['mask_financial']) === 'on'),
        includePii: canReadPii && one(body['include_pii']) === 'on',
        enabled: one(body['enabled']) === 'on',
        ...(intervalFrom(body) !== undefined ? { intervalSec: intervalFrom(body) } : {}),
      }
      try {
        const created = await apiClient.createDestination(user.token, input)
        flashSuccess(
          reply,
          `Destination "${created.name}" created. Test the connection before its first run.`,
        )
        return reply.redirect(`/destinations/${encodeURIComponent(created.id)}`)
      } catch (err) {
        const s = status(err)
        if (s === undefined || s < 400 || s >= 500) throw err
        return renderNew(request, reply, {
          types,
          type,
          body,
          selected: selection,
          error: upstreamRefusal(err),
          statusCode: s === 409 ? 409 : s === 403 ? 403 : 400,
        })
      }
    })

    fastify.get<{ Params: { id: string } }>('/destinations/:id', async (request, reply) => {
      const user = request.sessionUser!
      const dest = await apiClient.getDestination(user.token, request.params.id)
      if (!dest) return notFound(request, reply)
      const [types, runs] = await Promise.all([
        apiClient.listDestinationTypes(user.token).catch(() => []),
        apiClient.listDestinationRuns(user.token, dest.id).catch(() => []),
      ])
      const type = types.find((t) => t.type === dest.type) ?? null
      return reply.view('destinations/detail.ejs', {
        user,
        dest,
        type,
        secretGroups: groupsFromSchema(type?.secretsSchema ?? null, { secret: true }),
        runs,
        scopeText: describeScope(dest.scope?.tenants ?? [], dest.scope?.verticals),
        intervalText: formatInterval(dest.intervalSec),
        intervalMin: Math.round(dest.intervalSec / 60),
        canReadPii: hasPermission(user, 'data:read_pii'),
        verticalOptions: KNOWN_VERTICALS.filter(
          (v) => !dest.scope?.verticals || Object.hasOwn(dest.scope.verticals, v),
        ).map((v) => ({ id: v, label: VERTICAL_LABELS[v] })),
        title: dest.name,
      })
    })

    /**
     * Run a detail-page action and come back to the page with its outcome as
     * a toast. Upstream refusals (4xx) become the toast; anything else reaches
     * the central error handler.
     */
    async function action(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
      run: (token: string, id: string) => Promise<string>,
      opts: { back?: string } = {},
    ) {
      const id = request.params.id
      const detail = `/destinations/${encodeURIComponent(id)}`
      try {
        flashSuccess(reply, await run(request.sessionUser!.token, id))
      } catch (err) {
        const s = status(err)
        if (s === 404) return notFound(request, reply)
        if (s === undefined || s < 400 || s >= 500) throw err
        flashError(reply, refusalText(upstreamRefusal(err)))
        return reply.redirect(detail)
      }
      return reply.redirect(opts.back ?? detail)
    }

    fastify.post<{ Params: { id: string }; Body: Form }>(
      '/destinations/:id/settings',
      async (request, reply) => {
        const body = request.body ?? {}
        const patch: Partial<DestinationInput> = { enabled: one(body['enabled']) === 'on' }
        const name = one(body['name'])
        if (name) patch.name = name
        const interval = intervalFrom(body)
        if (interval !== undefined) patch.intervalSec = interval
        // Only a data:read_pii holder sees the PII control; nobody else can
        // flip it from here (admin-api would refuse turning it on anyway).
        if (
          hasPermission(request.sessionUser, 'data:read_pii') &&
          one(body['pii_control']) === '1'
        ) {
          patch.includePii = one(body['include_pii']) === 'on'
        }
        return action(request, reply, async (token, id) => {
          await apiClient.updateDestination(token, id, patch)
          return 'Destination settings saved.'
        })
      },
    )

    fastify.post<{ Params: { id: string } }>('/destinations/:id/test', async (request, reply) =>
      action(request, reply, async (token, id) => {
        const r = await apiClient.testDestination(token, id)
        if (!r?.ok) {
          throw Object.assign(new Error('test failed'), {
            response: {
              status: 400,
              data: {
                error: { message: `Connection test failed: ${r?.error ?? 'unknown error'}` },
              },
            },
          })
        }
        return `Connection OK (${r.latencyMs} ms).`
      }),
    )

    fastify.post<{ Params: { id: string } }>('/destinations/:id/run', async (request, reply) =>
      action(request, reply, async (token, id) => {
        const r = await apiClient.runDestination(token, id)
        return `Run started (${r.runId}). Refresh to follow it in the run history.`
      }),
    )

    fastify.post<{ Params: { id: string }; Body: Form }>(
      '/destinations/:id/backfill',
      async (request, reply) => {
        const body = request.body ?? {}
        const vertical = one(body['vertical'])
        const resourceType = one(body['resource_type'])
        return action(request, reply, async (token, id) => {
          const r = await apiClient.backfillDestination(token, id, {
            ...(vertical ? { vertical } : {}),
            ...(vertical && resourceType ? { resourceType } : {}),
          })
          return r.runId
            ? `Backfill started: ${r.cursorsReset} cursor(s) reset, run ${r.runId} started.`
            : `${r.cursorsReset} cursor(s) reset; the next run re-exports them.`
        })
      },
    )

    fastify.post<{ Params: { id: string }; Body: Form }>(
      '/destinations/:id/credentials',
      async (request, reply) => {
        const user = request.sessionUser!
        const dest = await apiClient.getDestination(user.token, request.params.id)
        if (!dest) return notFound(request, reply)
        const types = await apiClient.listDestinationTypes(user.token).catch(() => [])
        const schema = types.find((t) => t.type === dest.type)?.secretsSchema ?? null
        const secrets = secretsFromForm(schema, request.body ?? {})
        return action(request, reply, async (token, id) => {
          const updated = await apiClient.rotateDestinationCredentials(token, id, secrets)
          const set = updated?.secretFieldsSet ?? []
          return set.length > 0
            ? `Credentials replaced (${set.join(', ')} set).`
            : 'Credentials cleared: the destination now uses the default credential chain.'
        })
      },
    )

    fastify.post<{ Params: { id: string } }>('/destinations/:id/delete', async (request, reply) =>
      action(
        request,
        reply,
        async (token, id) => {
          await apiClient.deleteDestination(token, id)
          return 'Destination deleted. Files and rows it already exported stay where they are.'
        },
        { back: '/destinations' },
      ),
    )
  }
}
