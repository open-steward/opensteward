/**
 * DDL for read-only SQL access (Postgres only).
 *
 * Everything here is a pure function of its inputs — no clock, no randomness —
 * so the provisioning script is snapshot-tested and a reviewer can read exactly
 * what a deploy will run. Layout:
 *
 *   os_analytics_internal   mask functions, visible(), principal scopes,
 *                           catalog_versions and the hmac key. Owned by the
 *                           owner role; readers get USAGE + EXECUTE only.
 *   os_analytics_v{N}       masked views, one per resource type + system views
 *   os_analytics_pii_v{N}   the same views, unmasked (secrets still removed)
 *   os_analytics            stable alias: `SELECT *` over the current version
 *   os_analytics_pii        stable alias for the unmasked views
 *
 * Security model:
 *   - Views are owned by a NOLOGIN owner role and created WITH
 *     (security_barrier), so a reader's own predicates never run before the
 *     view's tenant filter.
 *   - The tenant filter is `os_analytics_internal.visible(owner, vertical)`, a
 *     SECURITY DEFINER function keyed on `session_user`, reading the principal
 *     scope tables the reader cannot see. `session_user` (not current_user)
 *     so `SET ROLE` does not change what a login sees.
 *   - Readers hold no privilege on any base table. Table RLS is not used: the
 *     unmasked `data` column would still be readable through it.
 *   - Every function pins `search_path`, so a reader cannot shadow an operator
 *     or builtin the mask functions call with one of their own.
 *   - The hmac key lives in a table only the owner can read; the views join it
 *     as a base relation, and the mask functions take it as an argument, so a
 *     reader calling them directly has no key to test guesses with.
 */
import { escapeIdentifier, escapeLiteral } from 'pg'
import {
  DEFAULT_RULE_KEY,
  IMPLICIT_PII_FIELDS,
  type FieldClass,
  type MaskKind,
  type ResourceClassification,
} from '@opensteward/shared'
import {
  rulesToClassification,
  type AnalyticsCatalog,
  type CatalogColumn,
  type CatalogView,
  type SqlType,
} from './view-catalog'

export const INTERNAL_SCHEMA = 'os_analytics_internal'
export const ALIAS_SCHEMA = 'os_analytics'
export const ALIAS_PII_SCHEMA = 'os_analytics_pii'
export const ADVISORY_LOCK_KEY = 'opensteward:analytics'

export const versionSchema = (version: number) => `os_analytics_v${version}`
export const piiVersionSchema = (version: number) => `os_analytics_pii_v${version}`

// ── Quoting ──────────────────────────────────────────────────────────────

const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/
const PREFIX = /^[a-z][a-z0-9_]{0,15}$/

/** An identifier, quoted. Names built here are already safe; quoting is belt and braces. */
export const ident = (name: string) => escapeIdentifier(name)
/** A string literal, quoted (handles backslashes with the E'' form). */
export const lit = (value: string) => escapeLiteral(value)

export function assertRolePrefix(prefix: string): void {
  if (!PREFIX.test(prefix)) {
    throw new Error(
      `ANALYTICS_ROLE_PREFIX must match ${PREFIX} (lowercase, starts with a letter, ≤16 chars); got ${JSON.stringify(prefix)}`,
    )
  }
}

export function assertRoleName(name: string): void {
  if (!ROLE_NAME.test(name)) throw new Error(`invalid role name ${JSON.stringify(name)}`)
}

export interface RoleNames {
  owner: string
  reader: string
  readerPii: string
}

/** Roles are cluster-global, so every one carries the deployment prefix. */
export function roleNames(prefix: string): RoleNames {
  assertRolePrefix(prefix)
  return {
    owner: `${prefix}_analytics_owner`,
    reader: `${prefix}_analytics_reader`,
    readerPii: `${prefix}_analytics_reader_pii`,
  }
}

export interface QualifiedName {
  schema: string
  name: string
}

const qn = (t: QualifiedName) => `${ident(t.schema)}.${ident(t.name)}`
const fn = (name: string) => `${INTERNAL_SCHEMA}.${ident(name)}`

// ── Static internal objects ──────────────────────────────────────────────

/**
 * Pinned search_path for every function. pg_temp last: temp objects are never
 * searched for functions or operators, and a reader's temp tables are not
 * searched for relations ahead of the catalog.
 */
const PIN = 'SET search_path = pg_catalog, pg_temp'

/**
 * SQL mirrors of `packages/shared/src/data-classification/mask.ts`. The
 * Postgres integration test checks these against `maskValue` for sample
 * values; change both together.
 */
export const INTERNAL_FUNCTIONS = String.raw`
-- Safe casts: NULL instead of an error, so one malformed upstream value
-- cannot fail a whole BI query.
CREATE OR REPLACE FUNCTION os_analytics_internal.try_numeric(s text) RETURNS numeric
  LANGUAGE sql IMMUTABLE ${PIN} AS $fn$
  SELECT CASE WHEN s ~ '^\s*[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]{1,4})?\s*$'
              THEN s::numeric END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_boolean(s text) RETURNS boolean
  LANGUAGE sql IMMUTABLE ${PIN} AS $fn$
  SELECT CASE lower(s) WHEN 'true' THEN true WHEN 'false' THEN false END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_timestamptz(s text) RETURNS timestamptz
  LANGUAGE plpgsql STABLE ${PIN} AS $fn$
BEGIN
  IF s IS NULL OR s !~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN s::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_date(s text) RETURNS date
  LANGUAGE plpgsql STABLE ${PIN} AS $fn$
BEGIN
  IF s IS NULL OR s !~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN s::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_jsonb(s text) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE ${PIN} AS $fn$
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN s::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

-- maskEmail: first character + '***' + everything from the last '@'.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_email(s text) RETURNS text
  LANGUAGE sql IMMUTABLE ${PIN} AS $fn$
  SELECT CASE
    WHEN s IS NULL THEN NULL
    WHEN strpos(s, '@') = 0 THEN '***'
    WHEN length(s) - strpos(reverse(s), '@') + 1 <= 1 THEN '***'
    ELSE left(s, 1) || '***' || substr(s, length(s) - strpos(reverse(s), '@') + 1)
  END
$fn$;

-- maskPhone: every digit but the last two replaced by '*'.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_phone(s text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE ${PIN} AS $fn$
DECLARE
  total integer;
  seen integer := 0;
  out text := '';
  ch text;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  total := length(regexp_replace(s, '[^0-9]', '', 'g'));
  FOR i IN 1..length(s) LOOP
    ch := substr(s, i, 1);
    IF ch ~ '^[0-9]$' THEN
      seen := seen + 1;
      out := out || CASE WHEN seen > total - 2 THEN ch ELSE '*' END;
    ELSE
      out := out || ch;
    END IF;
  END LOOP;
  RETURN out;
END
$fn$;

-- maskName: first letter of each word + '***'.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_name(s text) RETURNS text
  LANGUAGE sql IMMUTABLE ${PIN} AS $fn$
  SELECT CASE WHEN s IS NULL THEN NULL ELSE (
    SELECT COALESCE(string_agg(left(w, 1) || '***', ' ' ORDER BY n), '')
      FROM regexp_split_to_table(s, '\s+') WITH ORDINALITY AS t(w, n)
     WHERE w <> ''
  ) END
$fn$;

-- maskAddress: every leaf '***' except country / countryCode.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_address(v jsonb) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE ${PIN} AS $fn$
DECLARE
  out jsonb;
  k text;
  val jsonb;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN v; END IF;
  IF jsonb_typeof(v) = 'array' THEN
    RETURN COALESCE(
      (SELECT jsonb_agg(os_analytics_internal.mask_address(e) ORDER BY n)
         FROM jsonb_array_elements(v) WITH ORDINALITY AS t(e, n)),
      '[]'::jsonb);
  END IF;
  IF jsonb_typeof(v) = 'object' THEN
    out := '{}'::jsonb;
    FOR k, val IN SELECT e.key, e.value FROM jsonb_each(v) AS e LOOP
      IF k ~* '^country(code)?$' OR jsonb_typeof(val) = 'null' THEN
        out := out || jsonb_build_object(k, val);
      ELSIF jsonb_typeof(val) IN ('object', 'array') THEN
        out := out || jsonb_build_object(k, os_analytics_internal.mask_address(val));
      ELSE
        out := out || jsonb_build_object(k, '***');
      END IF;
    END LOOP;
    RETURN out;
  END IF;
  RETURN to_jsonb('***'::text);
END
$fn$;

-- hmac: HMAC-SHA256 hex, first 16 characters. NULL when pgcrypto is missing
-- or there is no key — the caller then redacts. SECURITY DEFINER only so the
-- pgcrypto schema need not be readable by readers; the key is an argument.
CREATE OR REPLACE FUNCTION os_analytics_internal.hmac_hex(v text, k bytea) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER ${PIN} AS $fn$
DECLARE
  s name;
  r text;
BEGIN
  IF v IS NULL OR k IS NULL OR length(k) = 0 THEN RETURN NULL; END IF;
  SELECT n.nspname INTO s
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';
  IF s IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT encode(%I.hmac(convert_to($1, %L), $2, %L), %L)', s, 'UTF8', 'sha256', 'hex')
     INTO r USING v, k;
  RETURN left(r, 16);
END
$fn$;

-- maskValue: one value under a mask. JSON null passes through.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_value(v jsonb, kind text, k bytea) RETURNS jsonb
  LANGUAGE plpgsql STABLE ${PIN} AS $fn$
DECLARE
  t text;
  h text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN v; END IF;
  t := jsonb_typeof(v);
  IF kind = 'hmac' THEN
    h := os_analytics_internal.hmac_hex(CASE WHEN t = 'string' THEN v #>> '{}' ELSE v::text END, k);
    RETURN to_jsonb(COALESCE(h, '[REDACTED]'));
  ELSIF kind = 'address' THEN
    RETURN os_analytics_internal.mask_address(v);
  ELSIF kind IN ('email', 'phone', 'name') THEN
    IF t = 'array' THEN
      RETURN COALESCE(
        (SELECT jsonb_agg(os_analytics_internal.mask_value(e, kind, k) ORDER BY n)
           FROM jsonb_array_elements(v) WITH ORDINALITY AS x(e, n)),
        '[]'::jsonb);
    END IF;
    IF t = 'number' AND kind = 'phone' THEN
      RETURN to_jsonb(os_analytics_internal.mask_phone(v::text));
    END IF;
    IF t <> 'string' THEN RETURN to_jsonb('[REDACTED]'::text); END IF;
    IF kind = 'email' THEN RETURN to_jsonb(os_analytics_internal.mask_email(v #>> '{}')); END IF;
    IF kind = 'phone' THEN RETURN to_jsonb(os_analytics_internal.mask_phone(v #>> '{}')); END IF;
    RETURN to_jsonb(os_analytics_internal.mask_name(v #>> '{}'));
  END IF;
  RETURN to_jsonb('[REDACTED]'::text);
END
$fn$;

-- One rule's action on one key of an object: remove it, or mask its value.
CREATE OR REPLACE FUNCTION os_analytics_internal.apply_leaf(doc jsonb, key text, action text, kind text, k bytea) RETURNS jsonb
  LANGUAGE sql STABLE ${PIN} AS $fn$
  SELECT CASE
    WHEN action = 'remove' THEN doc - key
    ELSE jsonb_set(doc, ARRAY[key], os_analytics_internal.mask_value(doc -> key, kind, k))
  END
$fn$;

-- applyMasking's visit(): walk a classified path (keys, with '[]' markers in
-- arrs) and apply the action at every location it addresses.
CREATE OR REPLACE FUNCTION os_analytics_internal.apply_rule(
  doc jsonb, keys text[], arrs boolean[], idx integer, action text, kind text, k bytea
) RETURNS jsonb
  LANGUAGE plpgsql STABLE ${PIN} AS $fn$
DECLARE
  out jsonb;
  names text[];
  name text;
  val jsonb;
  last boolean;
BEGIN
  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN RETURN doc; END IF;
  last := idx = array_length(keys, 1);
  IF keys[idx] = '*' THEN
    names := ARRAY(SELECT jsonb_object_keys(doc));
  ELSE
    names := ARRAY[keys[idx]];
  END IF;
  out := doc;
  FOREACH name IN ARRAY names LOOP
    IF NOT (out ? name) THEN CONTINUE; END IF;
    val := out -> name;
    IF arrs[idx] THEN
      IF jsonb_typeof(val) <> 'array' OR last THEN
        IF last THEN out := os_analytics_internal.apply_leaf(out, name, action, kind, k); END IF;
        CONTINUE;
      END IF;
      out := jsonb_set(out, ARRAY[name], COALESCE(
        (SELECT jsonb_agg(os_analytics_internal.apply_rule(e, keys, arrs, idx + 1, action, kind, k) ORDER BY n)
           FROM jsonb_array_elements(val) WITH ORDINALITY AS x(e, n)),
        '[]'::jsonb));
    ELSIF last THEN
      out := os_analytics_internal.apply_leaf(out, name, action, kind, k);
    ELSE
      out := jsonb_set(out, ARRAY[name], os_analytics_internal.apply_rule(val, keys, arrs, idx + 1, action, kind, k));
    END IF;
  END LOOP;
  RETURN out;
END
$fn$;

-- The fallback rules applyMasking adds for top-level keys no explicit rule
-- addresses: the upstream payload (implicit pii/redact) and the '*' default.
CREATE OR REPLACE FUNCTION os_analytics_internal.apply_fallback(
  doc jsonb, addressed text[], implicit text[], implicit_action text,
  default_action text, default_kind text, k bytea
) RETURNS jsonb
  LANGUAGE plpgsql STABLE ${PIN} AS $fn$
DECLARE
  out jsonb;
  name text;
BEGIN
  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN RETURN doc; END IF;
  out := doc;
  FOR name IN SELECT jsonb_object_keys(doc) LOOP
    IF name = ANY(implicit) THEN
      IF implicit_action IS NOT NULL THEN
        out := os_analytics_internal.apply_leaf(out, name, implicit_action, 'redact', k);
      END IF;
    ELSIF name = ANY(addressed) THEN
      CONTINUE;
    ELSIF default_action IS NOT NULL THEN
      out := os_analytics_internal.apply_leaf(out, name, default_action, default_kind, k);
    END IF;
  END LOOP;
  RETURN out;
END
$fn$;

-- Row visibility for the logged-in principal. A connection with no owner
-- tenant is visible only to an all-tenant scope, as in the data viewer.
CREATE OR REPLACE FUNCTION os_analytics_internal.visible(owner_tenant_id text, vertical text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER ${PIN} AS $fn$
  SELECT EXISTS (
           SELECT 1 FROM os_analytics_internal.principal_all_scope s
            WHERE s.role_name = session_user::text
              AND (s.vertical = '*' OR s.vertical = $2))
      OR ($1 IS NOT NULL AND EXISTS (
           SELECT 1 FROM os_analytics_internal.principal_scopes s
            WHERE s.role_name = session_user::text
              AND s.owner_tenant_id = $1
              AND (s.vertical = '*' OR s.vertical = $2)))
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.visible_tenant(tenant_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER ${PIN} AS $fn$
  SELECT EXISTS (SELECT 1 FROM os_analytics_internal.principal_all_scope s
                  WHERE s.role_name = session_user::text)
      OR EXISTS (SELECT 1 FROM os_analytics_internal.principal_scopes s
                  WHERE s.role_name = session_user::text AND s.owner_tenant_id = $1)
$fn$;
`.trim()

const INTERNAL_TABLES = `
CREATE TABLE IF NOT EXISTS os_analytics_internal.principal_scopes (
  role_name       text NOT NULL,
  owner_tenant_id text NOT NULL,
  vertical        text NOT NULL DEFAULT '*',
  PRIMARY KEY (role_name, owner_tenant_id, vertical)
);
CREATE TABLE IF NOT EXISTS os_analytics_internal.principal_all_scope (
  role_name text NOT NULL,
  vertical  text NOT NULL DEFAULT '*',
  PRIMARY KEY (role_name, vertical)
);
CREATE TABLE IF NOT EXISTS os_analytics_internal.catalog_versions (
  version    integer     NOT NULL,
  hash       text        NOT NULL,
  catalog    jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, hash)
);
CREATE TABLE IF NOT EXISTS os_analytics_internal.mask_key (
  id  integer PRIMARY KEY CHECK (id = 1),
  key bytea   NOT NULL
);
REVOKE ALL ON os_analytics_internal.principal_scopes, os_analytics_internal.principal_all_scope,
  os_analytics_internal.catalog_versions, os_analytics_internal.mask_key FROM PUBLIC;
`.trim()

// ── Per-resource document functions ──────────────────────────────────────

type Action = 'mask' | 'remove' | null

function actionFor(cls: FieldClass, revealPii: boolean): Action {
  if (cls === 'secret') return 'remove'
  if (cls === 'pii') return revealPii ? null : 'mask'
  // financial: tagged, masked only when the deployment masks financial data,
  // which SQL access does not (yet) read. public/internal: never masked.
  return null
}

interface Segment {
  key: string
  array: boolean
}

function parsePath(path: string): Segment[] {
  return path.split('.').map((raw) => {
    const array = raw.endsWith('[]')
    return { key: array ? raw.slice(0, -2) : raw, array }
  })
}

const textArray = (xs: string[]) =>
  xs.length === 0 ? `ARRAY[]::text[]` : `ARRAY[${xs.map(lit).join(', ')}]::text[]`
const boolArray = (xs: boolean[]) => `ARRAY[${xs.map(String).join(', ')}]::boolean[]`
const litOrNull = (s: string | null | undefined) => (s == null ? 'NULL' : lit(s))

/**
 * The expression applyMasking computes, over `d` (the stored record) and `k`
 * (the hmac key): fallback rules for unaddressed top-level keys, then every
 * explicit rule, shallowest first, in the sidecar's order.
 */
export function docExpression(
  classification: ResourceClassification,
  revealPii: boolean,
  stripFields: readonly string[] = [],
): string {
  let expr = 'd'
  for (const f of stripFields) expr = `(${expr} - ${lit(f)})`

  const explicit = Object.keys(classification)
    .filter((k) => k !== DEFAULT_RULE_KEY)
    .map((path, order) => ({ path, order, segs: parsePath(path), rule: classification[path]! }))
  const addressed = [...new Set(explicit.map((r) => r.segs[0]!.key))]
  const implicit = IMPLICIT_PII_FIELDS.filter(
    (k) => classification[k] === undefined && !stripFields.includes(k),
  )
  const def = classification[DEFAULT_RULE_KEY] ?? { class: 'internal' as FieldClass }
  const defAction = actionFor(def.class, revealPii)
  const implicitAction = actionFor('pii', revealPii)
  if (implicitAction !== null || defAction !== null) {
    expr =
      `${INTERNAL_SCHEMA}.apply_fallback(${expr}, ${textArray(addressed)}, ${textArray([...implicit])}, ` +
      `${litOrNull(implicitAction)}, ${litOrNull(defAction)}, ${litOrNull(defAction === 'mask' ? (def.mask ?? 'redact') : null)}, k)`
  }

  explicit.sort((a, b) => a.segs.length - b.segs.length || a.order - b.order)
  for (const r of explicit) {
    const action = actionFor(r.rule.class, revealPii)
    if (action === null) continue
    const kind: MaskKind | null = action === 'mask' ? (r.rule.mask ?? 'redact') : null
    expr =
      `${INTERNAL_SCHEMA}.apply_rule(${expr}, ${textArray(r.segs.map((s) => s.key))}, ` +
      `${boolArray(r.segs.map((s) => s.array))}, 1, ${lit(action)}, ${litOrNull(kind)}, k)`
  }
  return expr
}

function docFunctionName(view: string, revealPii: boolean): string {
  const name = `${revealPii ? 'dp' : 'dm'}_${view}`
  if (name.length <= 63) return name
  let h = 0
  for (const ch of view) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return `${name.slice(0, 54)}_${h.toString(16).padStart(8, '0')}`
}

function docFunction(
  view: string,
  rules: ResourceClassification,
  stripFields: readonly string[],
  revealPii: boolean,
): string {
  return [
    `CREATE FUNCTION ${fn(docFunctionName(view, revealPii))}(d jsonb, k bytea) RETURNS jsonb`,
    `  LANGUAGE sql STABLE ${PIN} AS $fn$`,
    `  SELECT ${docExpression(rules, revealPii, stripFields)}`,
    `$fn$;`,
  ].join('\n')
}

// ── Views ────────────────────────────────────────────────────────────────

function fieldExpr(col: CatalogColumn, type: SqlType): string {
  const path = `d.doc ${type === 'jsonb' ? '->' : '->>'} ${lit(col.field!)}`
  switch (type) {
    case 'text':
    case 'jsonb':
      return `(${path})`
    case 'numeric':
      return `${INTERNAL_SCHEMA}.try_numeric(${path})`
    case 'boolean':
      return `${INTERNAL_SCHEMA}.try_boolean(${path})`
    case 'timestamptz':
      return `${INTERNAL_SCHEMA}.try_timestamptz(${path})`
    case 'date':
      return `${INTERNAL_SCHEMA}.try_date(${path})`
  }
}

const ms = (col: string) => `to_timestamp(${col} / 1000.0)`

const STORE_EXPR: Record<string, string> = {
  connection_id: 'r.tenant_id',
  owner_tenant_id: 'c.owner_tenant_id',
  platform: 'r.platform',
  vertical: 'r.vertical',
  resource_id: 'r.resource_id',
  fetched_at: ms('r.fetched_at'),
  updated_at: ms('r.updated_at'),
  changed_at: ms('COALESCE(r.changed_at, r.updated_at)'),
  norm_version: 'r.norm_version',
}

export interface BaseTables {
  resources: QualifiedName
  credentials: QualifiedName
  /** Absent when the sync-job table does not exist → no `sync_status` view. */
  syncJobs?: QualifiedName | null
  /** admin-api's tenants table, when it shares the database → `tenants` view. */
  tenants?: QualifiedName | null
}

function resourceView(
  schema: string,
  view: CatalogView,
  tables: BaseTables,
  revealPii: boolean,
): string {
  const cols = view.columns.map((c) => {
    let expr: string
    if (c.source === 'store') expr = STORE_EXPR[c.name]!
    else if (c.source === 'data') expr = 'd.doc'
    else expr = fieldExpr(c, revealPii ? c.type : c.maskedType)
    return `  ${expr} AS ${ident(c.name)}`
  })
  const keyArg = revealPii
    ? 'NULL::bytea'
    : `(SELECT mk.key FROM ${INTERNAL_SCHEMA}.mask_key mk WHERE mk.id = 1)`
  return [
    `CREATE VIEW ${ident(schema)}.${ident(view.name)} WITH (security_barrier) AS`,
    `SELECT`,
    cols.join(',\n'),
    `FROM ${qn(tables.resources)} r`,
    `JOIN ${qn(tables.credentials)} c ON c.id = r.tenant_id`,
    `CROSS JOIN LATERAL (SELECT ${fn(docFunctionName(view.name, revealPii))}(r.data::jsonb, ${keyArg}) AS doc) d`,
    `WHERE r.vertical = ${lit(view.vertical!)} AND r.resource_type = ${lit(view.resourceType!)}`,
    `  AND ${INTERNAL_SCHEMA}.visible(c.owner_tenant_id, r.vertical);`,
  ].join('\n')
}

function systemView(schema: string, view: CatalogView, tables: BaseTables): string | null {
  const head = `CREATE VIEW ${ident(schema)}.${ident(view.name)} WITH (security_barrier) AS`
  switch (view.name) {
    case 'connections':
      return [
        head,
        `SELECT c.id AS connection_id, c.owner_tenant_id, c.platform, c.vertical, c.label,`,
        `  ${ms('c.created_at')} AS created_at, ${ms('c.updated_at')} AS updated_at,`,
        `  ${ms('c.expires_at')} AS expires_at, ${ms('c.last_refresh_at')} AS last_refresh_at,`,
        `  c.last_refresh_status`,
        `FROM ${qn(tables.credentials)} c`,
        `WHERE ${INTERNAL_SCHEMA}.visible(c.owner_tenant_id, c.vertical);`,
      ].join('\n')
    case 'sync_status':
      if (!tables.syncJobs) return null
      return [
        head,
        `SELECT j.id AS job_id, j.connection_id, c.owner_tenant_id, j.vertical, j.platform, j.status,`,
        `  ${INTERNAL_SCHEMA}.try_jsonb(j.progress) AS progress,`,
        `  ${ms('j.created_at')} AS created_at, ${ms('j.started_at')} AS started_at,`,
        `  ${ms('j.completed_at')} AS completed_at`,
        `FROM ${qn(tables.syncJobs)} j`,
        `JOIN ${qn(tables.credentials)} c ON c.id = j.connection_id`,
        `WHERE ${INTERNAL_SCHEMA}.visible(c.owner_tenant_id, j.vertical);`,
      ].join('\n')
    case 'tenants':
      if (!tables.tenants) return null
      return [
        head,
        `SELECT t.id AS tenant_id, t.name, ${ms('t.created_at')} AS created_at, ${ms('t.updated_at')} AS updated_at`,
        `FROM ${qn(tables.tenants)} t`,
        `WHERE ${INTERNAL_SCHEMA}.visible_tenant(t.id);`,
      ].join('\n')
    default:
      throw new Error(`analytics: no SQL for system view '${view.name}'`)
  }
}

// ── The provisioning script ──────────────────────────────────────────────

export interface CatalogVersion {
  version: number
  catalog: Pick<AnalyticsCatalog, 'views'>
}

export interface ProvisionScriptOptions {
  prefix: string
  /** The current version (the alias schemas point at it). */
  version: number
  catalog: AnalyticsCatalog
  /** Older versions kept for clients pinned to them; rebuilt with CURRENT masks. */
  retained?: CatalogVersion[]
  tables: BaseTables
  /** The service's own database role: may read catalog_versions for status. */
  appRole?: string | null
  /** Wrap in BEGIN/COMMIT + advisory lock (the manual script). The provisioner opens its own transaction. */
  standalone?: boolean
}

const CREDENTIAL_COLUMNS = [
  'id',
  'platform',
  'vertical',
  'owner_tenant_id',
  'label',
  'created_at',
  'updated_at',
  'expires_at',
  'last_refresh_at',
  'last_refresh_status',
]
const SYNC_JOB_COLUMNS = [
  'id',
  'connection_id',
  'vertical',
  'platform',
  'status',
  'progress',
  'created_at',
  'started_at',
  'completed_at',
]

/**
 * The whole provisioning script. Idempotent: roles and internal tables are
 * created if missing; every view schema is dropped and rebuilt, in one
 * transaction, so readers see the old views or the new ones and nothing
 * in between. Versions not in `retained` are dropped.
 */
export function generateProvisionScript(opts: ProvisionScriptOptions): string {
  const roles = roleNames(opts.prefix)
  const { owner, reader, readerPii } = roles
  const current: CatalogVersion = { version: opts.version, catalog: opts.catalog }
  const versions = [
    current,
    ...(opts.retained ?? []).filter((v) => v.version !== opts.version),
  ].sort((a, b) => b.version - a.version)
  const keepSchemas = versions.flatMap((v) => [
    versionSchema(v.version),
    piiVersionSchema(v.version),
  ])
  const tables = opts.tables
  const out: string[] = []
  const add = (...s: string[]) => out.push(...s)

  add(
    `-- OpenSteward read-only SQL access — provisioning script.`,
    `-- Generated from catalog ${opts.catalog.hash} (version ${opts.version}); do not edit.`,
    `-- Run as a role with CREATEROLE that owns (or may GRANT on) the store tables.`,
  )
  if (opts.standalone) {
    add(`BEGIN;`, `SELECT pg_advisory_xact_lock(hashtext(${lit(ADVISORY_LOCK_KEY)}));`)
  }
  add(`SET LOCAL lock_timeout = '30s';`, '')

  add(
    `-- 1. Group roles (NOLOGIN). Cluster-global, hence the '${opts.prefix}' prefix.`,
    `DO $do$`,
    `BEGIN`,
    ...[owner, reader, readerPii].flatMap((r) => [
      `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit(r)}) THEN`,
      `    CREATE ROLE ${ident(r)} NOLOGIN;`,
      `  END IF;`,
    ]),
    `END`,
    `$do$;`,
    `GRANT ${ident(owner)} TO CURRENT_USER;`,
    '',
    `-- 2. pgcrypto for hmac masks. Without it hmac-masked values render as [REDACTED].`,
    `DO $do$`,
    `BEGIN`,
    `  CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
    `EXCEPTION WHEN others THEN`,
    `  RAISE WARNING 'pgcrypto unavailable (%): hmac-masked columns render as [REDACTED]', SQLERRM;`,
    `END`,
    `$do$;`,
    '',
    `-- 3. The owner reads the store tables (credentials without its encrypted column); readers read none.`,
    `GRANT SELECT ON ${qn(tables.resources)} TO ${ident(owner)};`,
    `GRANT SELECT (${CREDENTIAL_COLUMNS.join(', ')}) ON ${qn(tables.credentials)} TO ${ident(owner)};`,
  )
  if (tables.syncJobs) {
    add(
      `GRANT SELECT (${SYNC_JOB_COLUMNS.join(', ')}) ON ${qn(tables.syncJobs)} TO ${ident(owner)};`,
    )
  }
  if (tables.tenants) {
    add(
      `GRANT SELECT (id, name, created_at, updated_at) ON ${qn(tables.tenants)} TO ${ident(owner)};`,
    )
  }
  const baseTables = [tables.resources, tables.credentials, tables.syncJobs, tables.tenants].filter(
    (t): t is QualifiedName => !!t,
  )
  // Belt and braces: the readers were never granted these. Wrapped, because a
  // REVOKE by a role holding no grant option on the object is an error.
  const revokes = [
    `REVOKE ALL ON ${baseTables.map(qn).join(', ')} FROM ${ident(reader)}, ${ident(readerPii)}`,
    ...[...new Set(baseTables.map((t) => t.schema))].map(
      (s) => `REVOKE CREATE ON SCHEMA ${ident(s)} FROM ${ident(reader)}, ${ident(readerPii)}`,
    ),
  ]
  add(
    `DO $do$`,
    `BEGIN`,
    ...revokes.flatMap((r) => [
      `  BEGIN`,
      `    ${r};`,
      `  EXCEPTION WHEN insufficient_privilege THEN NULL;`,
      `  END;`,
    ]),
    `END`,
    `$do$;`,
    '',
    `-- 4. Schemas. Aliases and view versions are rebuilt; the internal schema persists.`,
    `CREATE SCHEMA IF NOT EXISTS ${INTERNAL_SCHEMA} AUTHORIZATION ${ident(owner)};`,
    `DROP SCHEMA IF EXISTS ${ALIAS_SCHEMA} CASCADE;`,
    `DROP SCHEMA IF EXISTS ${ALIAS_PII_SCHEMA} CASCADE;`,
    `DO $do$`,
    `DECLARE s text;`,
    `BEGIN`,
    `  FOR s IN SELECT nspname::text FROM pg_namespace WHERE nspname ~ '^os_analytics(_pii)?_v[0-9]+$' LOOP`,
    `    EXECUTE format('DROP SCHEMA %I CASCADE', s);`,
    `  END LOOP;`,
    `  FOR s IN SELECT p.oid::regprocedure::text FROM pg_proc p`,
    `            WHERE p.pronamespace = ${lit(INTERNAL_SCHEMA)}::regnamespace AND p.proname ~ '^d[mp]_' LOOP`,
    `    EXECUTE 'DROP FUNCTION ' || s;`,
    `  END LOOP;`,
    `END`,
    `$do$;`,
    ...keepSchemas.map((s) => `CREATE SCHEMA ${ident(s)} AUTHORIZATION ${ident(owner)};`),
    `CREATE SCHEMA ${ALIAS_SCHEMA} AUTHORIZATION ${ident(owner)};`,
    `CREATE SCHEMA ${ALIAS_PII_SCHEMA} AUTHORIZATION ${ident(owner)};`,
    '',
    `-- 5. Everything below is created as, and owned by, the owner role.`,
    `SET LOCAL ROLE ${ident(owner)};`,
    '',
    INTERNAL_TABLES,
    '',
    INTERNAL_FUNCTIONS,
    '',
    `-- 6. Per-resource masking (masks always follow the CURRENT classification,`,
    `--    in every retained version).`,
  )

  // Rules by view name: the current catalog's, else the retained version's own.
  const docRules = new Map<string, { rules: ResourceClassification; strip: readonly string[] }>()
  for (const v of versions) {
    for (const view of v.catalog.views) {
      if (view.kind !== 'resource' || docRules.has(view.name)) continue
      docRules.set(view.name, {
        // A stored view with no rules fails closed: every field masked.
        rules: view.rules
          ? rulesToClassification(view.rules)
          : { '*': { class: 'pii', mask: 'redact' } },
        strip: view.stripFields ?? [],
      })
    }
  }
  for (const [name, { rules, strip }] of [...docRules.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    add(docFunction(name, rules, strip, false), docFunction(name, rules, strip, true))
  }

  for (const v of versions) {
    add('', `-- 7. Views, version ${v.version}.`)
    for (const [schema, revealPii] of [
      [versionSchema(v.version), false],
      [piiVersionSchema(v.version), true],
    ] as const) {
      for (const view of v.catalog.views) {
        const sql =
          view.kind === 'resource'
            ? resourceView(schema, view, tables, revealPii)
            : systemView(schema, view, tables)
        if (sql) add(sql)
      }
    }
  }

  add('', `-- 8. Stable aliases over version ${opts.version}.`)
  for (const [alias, target] of [
    [ALIAS_SCHEMA, versionSchema(opts.version)],
    [ALIAS_PII_SCHEMA, piiVersionSchema(opts.version)],
  ] as const) {
    for (const view of opts.catalog.views) {
      if (view.kind === 'system' && systemView(target, view, tables) === null) continue
      add(
        `CREATE VIEW ${alias}.${ident(view.name)} WITH (security_barrier) AS SELECT * FROM ${ident(target)}.${ident(view.name)};`,
      )
    }
  }

  const masked = [ALIAS_SCHEMA, ...versions.map((v) => versionSchema(v.version))].map(ident)
  const pii = [ALIAS_PII_SCHEMA, ...versions.map((v) => piiVersionSchema(v.version))].map(ident)
  add(
    '',
    `-- 9. Grants. Readers: USAGE on their schemas, SELECT on the views, EXECUTE on`,
    `--    the internal functions the views call. Nothing on any table.`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${INTERNAL_SCHEMA} FROM PUBLIC;`,
    `GRANT USAGE ON SCHEMA ${INTERNAL_SCHEMA} TO ${ident(reader)}, ${ident(readerPii)};`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${INTERNAL_SCHEMA} TO ${ident(reader)}, ${ident(readerPii)};`,
    `GRANT USAGE ON SCHEMA ${masked.join(', ')} TO ${ident(reader)};`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA ${masked.join(', ')} TO ${ident(reader)};`,
    `GRANT USAGE ON SCHEMA ${pii.join(', ')} TO ${ident(readerPii)};`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA ${pii.join(', ')} TO ${ident(readerPii)};`,
  )
  if (opts.appRole) {
    add(
      `GRANT USAGE ON SCHEMA ${INTERNAL_SCHEMA} TO ${ident(opts.appRole)};`,
      `GRANT SELECT ON ${INTERNAL_SCHEMA}.catalog_versions TO ${ident(opts.appRole)};`,
    )
  }
  const catalogJson = JSON.stringify({ format: opts.catalog.format, views: opts.catalog.views })
  if (catalogJson.includes('$catalog$'))
    throw new Error('analytics: catalog contains a dollar-quote tag')
  add(
    '',
    `-- 10. Record the catalog this script was generated from.`,
    `INSERT INTO ${INTERNAL_SCHEMA}.catalog_versions (version, hash, catalog)`,
    `VALUES (${opts.version}, ${lit(opts.catalog.hash)}, $catalog$${catalogJson}$catalog$::jsonb)`,
    `ON CONFLICT (version, hash) DO NOTHING;`,
    `RESET ROLE;`,
  )
  if (opts.standalone) add(`COMMIT;`)
  return out.join('\n') + '\n'
}

// ── Principals ───────────────────────────────────────────────────────────

export interface PrincipalScope {
  /** Owner tenants the principal sees, or every tenant. */
  tenants: '*' | string[]
  /** Verticals the principal sees; omitted or '*' = all. */
  verticals?: '*' | string[]
}

export interface CreatePrincipalSql {
  prefix: string
  roleName: string
  /** A SCRAM-SHA-256 verifier (never the plaintext — statements can be logged). */
  passwordVerifier: string
  pii: boolean
  connectionLimit: number
  validUntil: Date | null
  scope: PrincipalScope
  statementTimeout?: string
}

function scopeRows(roleName: string, scope: PrincipalScope): string[] {
  const verticals =
    scope.verticals === undefined || scope.verticals === '*' ? ['*'] : scope.verticals
  const r = lit(roleName)
  const out = [
    `DELETE FROM ${INTERNAL_SCHEMA}.principal_scopes WHERE role_name = ${r};`,
    `DELETE FROM ${INTERNAL_SCHEMA}.principal_all_scope WHERE role_name = ${r};`,
  ]
  if (scope.tenants === '*') {
    for (const v of verticals) {
      out.push(
        `INSERT INTO ${INTERNAL_SCHEMA}.principal_all_scope (role_name, vertical) VALUES (${r}, ${lit(v)});`,
      )
    }
  } else {
    for (const t of scope.tenants) {
      for (const v of verticals) {
        out.push(
          `INSERT INTO ${INTERNAL_SCHEMA}.principal_scopes (role_name, owner_tenant_id, vertical) VALUES (${r}, ${lit(t)}, ${lit(v)});`,
        )
      }
    }
  }
  return out
}

const validUntilSql = (d: Date | null) => (d ? lit(d.toISOString()) : `'infinity'`)

export function createPrincipalStatements(p: CreatePrincipalSql): string[] {
  assertRoleName(p.roleName)
  if (!/^SCRAM-SHA-256\$/.test(p.passwordVerifier))
    throw new Error('expected a SCRAM-SHA-256 verifier')
  if (!Number.isInteger(p.connectionLimit) || p.connectionLimit < 1)
    throw new Error('connectionLimit must be ≥ 1')
  const roles = roleNames(p.prefix)
  const role = ident(p.roleName)
  return [
    `CREATE ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT ` +
      `CONNECTION LIMIT ${p.connectionLimit} PASSWORD ${lit(p.passwordVerifier)} VALID UNTIL ${validUntilSql(p.validUntil)};`,
    `GRANT ${ident(p.pii ? roles.readerPii : roles.reader)} TO ${role};`,
    // Lets a non-superuser admin end this login's sessions on rotation and
    // revocation (pg_terminate_backend needs the privileges of the target role).
    `GRANT ${role} TO CURRENT_USER;`,
    `ALTER ROLE ${role} SET default_transaction_read_only = on;`,
    `ALTER ROLE ${role} SET statement_timeout = ${lit(p.statementTimeout ?? '60s')};`,
    `ALTER ROLE ${role} SET idle_in_transaction_session_timeout = '5min';`,
    `ALTER ROLE ${role} SET search_path = ${p.pii ? ALIAS_PII_SCHEMA : ALIAS_SCHEMA};`,
    ...scopeRows(p.roleName, p.scope),
  ]
}

export function rotatePrincipalStatements(roleName: string, passwordVerifier: string): string[] {
  assertRoleName(roleName)
  if (!/^SCRAM-SHA-256\$/.test(passwordVerifier))
    throw new Error('expected a SCRAM-SHA-256 verifier')
  return [`ALTER ROLE ${ident(roleName)} WITH PASSWORD ${lit(passwordVerifier)};`]
}

/**
 * Revocation: no login, no group membership (so an open session loses SELECT
 * on its next statement), no scope rows (so it also sees no rows). The role
 * itself is kept so its name is never reused for someone else.
 */
export function revokePrincipalStatements(prefix: string, roleName: string): string[] {
  assertRoleName(roleName)
  const roles = roleNames(prefix)
  const role = ident(roleName)
  const r = lit(roleName)
  return [
    `ALTER ROLE ${role} WITH NOLOGIN;`,
    `REVOKE ${ident(roles.reader)}, ${ident(roles.readerPii)} FROM ${role};`,
    `DELETE FROM ${INTERNAL_SCHEMA}.principal_scopes WHERE role_name = ${r};`,
    `DELETE FROM ${INTERNAL_SCHEMA}.principal_all_scope WHERE role_name = ${r};`,
  ]
}

export function terminateSessionsStatement(roleName: string): string {
  assertRoleName(roleName)
  return `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = ${lit(roleName)} AND pid <> pg_backend_pid();`
}
