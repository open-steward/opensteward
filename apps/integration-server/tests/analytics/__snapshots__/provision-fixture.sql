-- OpenSteward read-only SQL access — provisioning script.
-- Generated from catalog 667d3b27717d67e10004cacc59c1b4b3c1829ba5c7078b9101fdaae1b80bdbcc (version 2); do not edit.
-- Run as a role with CREATEROLE that owns (or may GRANT on) the store tables.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('opensteward:analytics'));
SET LOCAL lock_timeout = '30s';

-- 1. Group roles (NOLOGIN). Cluster-global, hence the 'os' prefix.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'os_analytics_owner') THEN
    CREATE ROLE "os_analytics_owner" NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'os_analytics_reader') THEN
    CREATE ROLE "os_analytics_reader" NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'os_analytics_reader_pii') THEN
    CREATE ROLE "os_analytics_reader_pii" NOLOGIN;
  END IF;
END
$do$;
GRANT "os_analytics_owner" TO CURRENT_USER;

-- 2. pgcrypto for hmac masks. Without it hmac-masked values render as [REDACTED].
DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN others THEN
  RAISE WARNING 'pgcrypto unavailable (%): hmac-masked columns render as [REDACTED]', SQLERRM;
END
$do$;

-- 3. The owner reads the store tables (credentials without its encrypted column); readers read none.
GRANT SELECT ON "public"."resources" TO "os_analytics_owner";
GRANT SELECT (id, platform, vertical, owner_tenant_id, label, created_at, updated_at, expires_at, last_refresh_at, last_refresh_status) ON "public"."credentials" TO "os_analytics_owner";
GRANT SELECT (id, connection_id, vertical, platform, status, progress, created_at, started_at, completed_at) ON "public"."sync_jobs" TO "os_analytics_owner";
GRANT SELECT (id, name, created_at, updated_at) ON "public"."tenants" TO "os_analytics_owner";
DO $do$
BEGIN
  BEGIN
    REVOKE ALL ON "public"."resources", "public"."credentials", "public"."sync_jobs", "public"."tenants" FROM "os_analytics_reader", "os_analytics_reader_pii";
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    REVOKE CREATE ON SCHEMA "public" FROM "os_analytics_reader", "os_analytics_reader_pii";
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$do$;

-- 4. Schemas. Aliases and view versions are rebuilt; the internal schema persists.
CREATE SCHEMA IF NOT EXISTS os_analytics_internal AUTHORIZATION "os_analytics_owner";
DROP SCHEMA IF EXISTS os_analytics CASCADE;
DROP SCHEMA IF EXISTS os_analytics_pii CASCADE;
DO $do$
DECLARE s text;
BEGIN
  FOR s IN SELECT nspname::text FROM pg_namespace WHERE nspname ~ '^os_analytics(_pii)?_v[0-9]+$' LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', s);
  END LOOP;
  FOR s IN SELECT p.oid::regprocedure::text FROM pg_proc p
            WHERE p.pronamespace = 'os_analytics_internal'::regnamespace AND p.proname ~ '^d[mp]_' LOOP
    EXECUTE 'DROP FUNCTION ' || s;
  END LOOP;
END
$do$;
CREATE SCHEMA "os_analytics_v2" AUTHORIZATION "os_analytics_owner";
CREATE SCHEMA "os_analytics_pii_v2" AUTHORIZATION "os_analytics_owner";
CREATE SCHEMA "os_analytics_v1" AUTHORIZATION "os_analytics_owner";
CREATE SCHEMA "os_analytics_pii_v1" AUTHORIZATION "os_analytics_owner";
CREATE SCHEMA os_analytics AUTHORIZATION "os_analytics_owner";
CREATE SCHEMA os_analytics_pii AUTHORIZATION "os_analytics_owner";

-- 5. Everything below is created as, and owned by, the owner role.
SET LOCAL ROLE "os_analytics_owner";

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

-- Safe casts: NULL instead of an error, so one malformed upstream value
-- cannot fail a whole BI query.
CREATE OR REPLACE FUNCTION os_analytics_internal.try_numeric(s text) RETURNS numeric
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT CASE WHEN s ~ '^\s*[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]{1,4})?\s*$'
              THEN s::numeric END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_boolean(s text) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT CASE lower(s) WHEN 'true' THEN true WHEN 'false' THEN false END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_timestamptz(s text) RETURNS timestamptz
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF s IS NULL OR s !~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN s::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_date(s text) RETURNS date
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF s IS NULL OR s !~ '^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN s::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION os_analytics_internal.try_jsonb(s text) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN s::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

-- maskEmail: first character + '***' + everything from the last '@'.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_email(s text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT CASE
    WHEN s IS NULL THEN NULL
    WHEN strpos(s, '@') = 0 THEN '***'
    WHEN length(s) - strpos(reverse(s), '@') + 1 <= 1 THEN '***'
    ELSE left(s, 1) || '***' || substr(s, length(s) - strpos(reverse(s), '@') + 1)
  END
$fn$;

-- maskPhone: every digit but the last two replaced by '*'.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_phone(s text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT CASE WHEN s IS NULL THEN NULL ELSE (
    SELECT COALESCE(string_agg(left(w, 1) || '***', ' ' ORDER BY n), '')
      FROM regexp_split_to_table(s, '\s+') WITH ORDINALITY AS t(w, n)
     WHERE w <> ''
  ) END
$fn$;

-- maskAddress: every leaf '***' except country / countryCode.
CREATE OR REPLACE FUNCTION os_analytics_internal.mask_address(v jsonb) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
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
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT EXISTS (SELECT 1 FROM os_analytics_internal.principal_all_scope s
                  WHERE s.role_name = session_user::text)
      OR EXISTS (SELECT 1 FROM os_analytics_internal.principal_scopes s
                  WHERE s.role_name = session_user::text AND s.owner_tenant_id = $1)
$fn$;

-- 6. Per-resource masking (masks always follow the CURRENT classification,
--    in every retained version).
CREATE FUNCTION os_analytics_internal."dm_crm_contacts"(d jsonb, k bytea) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_rule(os_analytics_internal.apply_fallback(d, ARRAY['first_name', 'email', 'phone', 'national_id', 'address', 'amount', 'birthDate', 'telephones', 'api_token']::text[], ARRAY['metadata', 'raw']::text[], 'mask', NULL, NULL, k), ARRAY['first_name']::text[], ARRAY[false]::boolean[], 1, 'mask', 'name', k), ARRAY['email']::text[], ARRAY[false]::boolean[], 1, 'mask', 'email', k), ARRAY['phone']::text[], ARRAY[false]::boolean[], 1, 'mask', 'phone', k), ARRAY['national_id']::text[], ARRAY[false]::boolean[], 1, 'mask', 'hmac', k), ARRAY['address']::text[], ARRAY[false]::boolean[], 1, 'mask', 'address', k), ARRAY['birthDate']::text[], ARRAY[false]::boolean[], 1, 'mask', 'redact', k), ARRAY['api_token']::text[], ARRAY[false]::boolean[], 1, 'remove', NULL, k), ARRAY['telephones', 'telephone']::text[], ARRAY[true, false]::boolean[], 1, 'mask', 'phone', k)
$fn$;
CREATE FUNCTION os_analytics_internal."dp_crm_contacts"(d jsonb, k bytea) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT os_analytics_internal.apply_rule(d, ARRAY['api_token']::text[], ARRAY[false]::boolean[], 1, 'remove', NULL, k)
$fn$;
CREATE FUNCTION os_analytics_internal."dm_payments_charges"(d jsonb, k bytea) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT os_analytics_internal.apply_rule(os_analytics_internal.apply_fallback((d - 'raw'), ARRAY['customer_email']::text[], ARRAY['metadata']::text[], 'mask', NULL, NULL, k), ARRAY['customer_email']::text[], ARRAY[false]::boolean[], 1, 'mask', 'email', k)
$fn$;
CREATE FUNCTION os_analytics_internal."dp_payments_charges"(d jsonb, k bytea) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT (d - 'raw')
$fn$;

-- 7. Views, version 2.
CREATE VIEW "os_analytics_v2"."connections" WITH (security_barrier) AS
SELECT c.id AS connection_id, c.owner_tenant_id, c.platform, c.vertical, c.label,
  to_timestamp(c.created_at / 1000.0) AS created_at, to_timestamp(c.updated_at / 1000.0) AS updated_at,
  to_timestamp(c.expires_at / 1000.0) AS expires_at, to_timestamp(c.last_refresh_at / 1000.0) AS last_refresh_at,
  c.last_refresh_status
FROM "public"."credentials" c
WHERE os_analytics_internal.visible(c.owner_tenant_id, c.vertical);
CREATE VIEW "os_analytics_v2"."crm_contacts" WITH (security_barrier) AS
SELECT
  r.tenant_id AS "connection_id",
  c.owner_tenant_id AS "owner_tenant_id",
  r.platform AS "platform",
  r.vertical AS "vertical",
  r.resource_id AS "resource_id",
  to_timestamp(r.fetched_at / 1000.0) AS "fetched_at",
  to_timestamp(r.updated_at / 1000.0) AS "updated_at",
  to_timestamp(COALESCE(r.changed_at, r.updated_at) / 1000.0) AS "changed_at",
  r.norm_version AS "norm_version",
  (d.doc ->> 'id') AS "id",
  (d.doc ->> 'first_name') AS "first_name",
  (d.doc ->> 'email') AS "email",
  (d.doc ->> 'phone') AS "phone",
  (d.doc ->> 'national_id') AS "national_id",
  (d.doc -> 'address') AS "address",
  os_analytics_internal.try_numeric(d.doc ->> 'amount') AS "amount",
  os_analytics_internal.try_boolean(d.doc ->> 'active') AS "active",
  os_analytics_internal.try_timestamptz(d.doc ->> 'created_at') AS "created_at",
  os_analytics_internal.try_timestamptz(d.doc ->> 'updated_at') AS "record_updated_at",
  (d.doc ->> 'birthDate') AS "birth_date",
  os_analytics_internal.try_timestamptz(d.doc ->> 'due_date') AS "due_date",
  (d.doc -> 'telephones') AS "telephones",
  (d.doc ->> 'stage') AS "stage",
  (d.doc ->> 'data') AS "record_data",
  (d.doc -> 'metadata') AS "metadata",
  d.doc AS "data"
FROM "public"."resources" r
JOIN "public"."credentials" c ON c.id = r.tenant_id
CROSS JOIN LATERAL (SELECT os_analytics_internal."dm_crm_contacts"(r.data::jsonb, (SELECT mk.key FROM os_analytics_internal.mask_key mk WHERE mk.id = 1)) AS doc) d
WHERE r.vertical = 'crm' AND r.resource_type = 'contacts'
  AND os_analytics_internal.visible(c.owner_tenant_id, r.vertical);
CREATE VIEW "os_analytics_v2"."payments_charges" WITH (security_barrier) AS
SELECT
  r.tenant_id AS "connection_id",
  c.owner_tenant_id AS "owner_tenant_id",
  r.platform AS "platform",
  r.vertical AS "vertical",
  r.resource_id AS "resource_id",
  to_timestamp(r.fetched_at / 1000.0) AS "fetched_at",
  to_timestamp(r.updated_at / 1000.0) AS "updated_at",
  to_timestamp(COALESCE(r.changed_at, r.updated_at) / 1000.0) AS "changed_at",
  r.norm_version AS "norm_version",
  (d.doc ->> 'id') AS "id",
  os_analytics_internal.try_numeric(d.doc ->> 'amount') AS "amount",
  (d.doc ->> 'customer_email') AS "customer_email",
  d.doc AS "data"
FROM "public"."resources" r
JOIN "public"."credentials" c ON c.id = r.tenant_id
CROSS JOIN LATERAL (SELECT os_analytics_internal."dm_payments_charges"(r.data::jsonb, (SELECT mk.key FROM os_analytics_internal.mask_key mk WHERE mk.id = 1)) AS doc) d
WHERE r.vertical = 'payments' AND r.resource_type = 'charges'
  AND os_analytics_internal.visible(c.owner_tenant_id, r.vertical);
CREATE VIEW "os_analytics_v2"."sync_status" WITH (security_barrier) AS
SELECT j.id AS job_id, j.connection_id, c.owner_tenant_id, j.vertical, j.platform, j.status,
  os_analytics_internal.try_jsonb(j.progress) AS progress,
  to_timestamp(j.created_at / 1000.0) AS created_at, to_timestamp(j.started_at / 1000.0) AS started_at,
  to_timestamp(j.completed_at / 1000.0) AS completed_at
FROM "public"."sync_jobs" j
JOIN "public"."credentials" c ON c.id = j.connection_id
WHERE os_analytics_internal.visible(c.owner_tenant_id, j.vertical);
CREATE VIEW "os_analytics_v2"."tenants" WITH (security_barrier) AS
SELECT t.id AS tenant_id, t.name, to_timestamp(t.created_at / 1000.0) AS created_at, to_timestamp(t.updated_at / 1000.0) AS updated_at
FROM "public"."tenants" t
WHERE os_analytics_internal.visible_tenant(t.id);
CREATE VIEW "os_analytics_pii_v2"."connections" WITH (security_barrier) AS
SELECT c.id AS connection_id, c.owner_tenant_id, c.platform, c.vertical, c.label,
  to_timestamp(c.created_at / 1000.0) AS created_at, to_timestamp(c.updated_at / 1000.0) AS updated_at,
  to_timestamp(c.expires_at / 1000.0) AS expires_at, to_timestamp(c.last_refresh_at / 1000.0) AS last_refresh_at,
  c.last_refresh_status
FROM "public"."credentials" c
WHERE os_analytics_internal.visible(c.owner_tenant_id, c.vertical);
CREATE VIEW "os_analytics_pii_v2"."crm_contacts" WITH (security_barrier) AS
SELECT
  r.tenant_id AS "connection_id",
  c.owner_tenant_id AS "owner_tenant_id",
  r.platform AS "platform",
  r.vertical AS "vertical",
  r.resource_id AS "resource_id",
  to_timestamp(r.fetched_at / 1000.0) AS "fetched_at",
  to_timestamp(r.updated_at / 1000.0) AS "updated_at",
  to_timestamp(COALESCE(r.changed_at, r.updated_at) / 1000.0) AS "changed_at",
  r.norm_version AS "norm_version",
  (d.doc ->> 'id') AS "id",
  (d.doc ->> 'first_name') AS "first_name",
  (d.doc ->> 'email') AS "email",
  (d.doc ->> 'phone') AS "phone",
  (d.doc ->> 'national_id') AS "national_id",
  (d.doc -> 'address') AS "address",
  os_analytics_internal.try_numeric(d.doc ->> 'amount') AS "amount",
  os_analytics_internal.try_boolean(d.doc ->> 'active') AS "active",
  os_analytics_internal.try_timestamptz(d.doc ->> 'created_at') AS "created_at",
  os_analytics_internal.try_timestamptz(d.doc ->> 'updated_at') AS "record_updated_at",
  os_analytics_internal.try_date(d.doc ->> 'birthDate') AS "birth_date",
  os_analytics_internal.try_timestamptz(d.doc ->> 'due_date') AS "due_date",
  (d.doc -> 'telephones') AS "telephones",
  (d.doc ->> 'stage') AS "stage",
  (d.doc ->> 'data') AS "record_data",
  (d.doc -> 'metadata') AS "metadata",
  d.doc AS "data"
FROM "public"."resources" r
JOIN "public"."credentials" c ON c.id = r.tenant_id
CROSS JOIN LATERAL (SELECT os_analytics_internal."dp_crm_contacts"(r.data::jsonb, NULL::bytea) AS doc) d
WHERE r.vertical = 'crm' AND r.resource_type = 'contacts'
  AND os_analytics_internal.visible(c.owner_tenant_id, r.vertical);
CREATE VIEW "os_analytics_pii_v2"."payments_charges" WITH (security_barrier) AS
SELECT
  r.tenant_id AS "connection_id",
  c.owner_tenant_id AS "owner_tenant_id",
  r.platform AS "platform",
  r.vertical AS "vertical",
  r.resource_id AS "resource_id",
  to_timestamp(r.fetched_at / 1000.0) AS "fetched_at",
  to_timestamp(r.updated_at / 1000.0) AS "updated_at",
  to_timestamp(COALESCE(r.changed_at, r.updated_at) / 1000.0) AS "changed_at",
  r.norm_version AS "norm_version",
  (d.doc ->> 'id') AS "id",
  os_analytics_internal.try_numeric(d.doc ->> 'amount') AS "amount",
  (d.doc ->> 'customer_email') AS "customer_email",
  d.doc AS "data"
FROM "public"."resources" r
JOIN "public"."credentials" c ON c.id = r.tenant_id
CROSS JOIN LATERAL (SELECT os_analytics_internal."dp_payments_charges"(r.data::jsonb, NULL::bytea) AS doc) d
WHERE r.vertical = 'payments' AND r.resource_type = 'charges'
  AND os_analytics_internal.visible(c.owner_tenant_id, r.vertical);
CREATE VIEW "os_analytics_pii_v2"."sync_status" WITH (security_barrier) AS
SELECT j.id AS job_id, j.connection_id, c.owner_tenant_id, j.vertical, j.platform, j.status,
  os_analytics_internal.try_jsonb(j.progress) AS progress,
  to_timestamp(j.created_at / 1000.0) AS created_at, to_timestamp(j.started_at / 1000.0) AS started_at,
  to_timestamp(j.completed_at / 1000.0) AS completed_at
FROM "public"."sync_jobs" j
JOIN "public"."credentials" c ON c.id = j.connection_id
WHERE os_analytics_internal.visible(c.owner_tenant_id, j.vertical);
CREATE VIEW "os_analytics_pii_v2"."tenants" WITH (security_barrier) AS
SELECT t.id AS tenant_id, t.name, to_timestamp(t.created_at / 1000.0) AS created_at, to_timestamp(t.updated_at / 1000.0) AS updated_at
FROM "public"."tenants" t
WHERE os_analytics_internal.visible_tenant(t.id);

-- 7. Views, version 1.
CREATE VIEW "os_analytics_v1"."connections" WITH (security_barrier) AS
SELECT c.id AS connection_id, c.owner_tenant_id, c.platform, c.vertical, c.label,
  to_timestamp(c.created_at / 1000.0) AS created_at, to_timestamp(c.updated_at / 1000.0) AS updated_at,
  to_timestamp(c.expires_at / 1000.0) AS expires_at, to_timestamp(c.last_refresh_at / 1000.0) AS last_refresh_at,
  c.last_refresh_status
FROM "public"."credentials" c
WHERE os_analytics_internal.visible(c.owner_tenant_id, c.vertical);
CREATE VIEW "os_analytics_v1"."crm_contacts" WITH (security_barrier) AS
SELECT
  r.tenant_id AS "connection_id",
  c.owner_tenant_id AS "owner_tenant_id",
  r.platform AS "platform",
  r.vertical AS "vertical",
  r.resource_id AS "resource_id",
  to_timestamp(r.fetched_at / 1000.0) AS "fetched_at",
  to_timestamp(r.updated_at / 1000.0) AS "updated_at",
  to_timestamp(COALESCE(r.changed_at, r.updated_at) / 1000.0) AS "changed_at",
  r.norm_version AS "norm_version",
  (d.doc ->> 'id') AS "id",
  (d.doc ->> 'first_name') AS "first_name",
  (d.doc ->> 'email') AS "email",
  (d.doc ->> 'phone') AS "phone",
  (d.doc ->> 'national_id') AS "national_id",
  (d.doc -> 'address') AS "address",
  os_analytics_internal.try_numeric(d.doc ->> 'amount') AS "amount",
  os_analytics_internal.try_boolean(d.doc ->> 'active') AS "active",
  os_analytics_internal.try_timestamptz(d.doc ->> 'created_at') AS "created_at",
  os_analytics_internal.try_timestamptz(d.doc ->> 'updated_at') AS "record_updated_at",
  (d.doc ->> 'birthDate') AS "birth_date",
  os_analytics_internal.try_timestamptz(d.doc ->> 'due_date') AS "due_date",
  (d.doc -> 'telephones') AS "telephones",
  (d.doc ->> 'stage') AS "stage",
  (d.doc ->> 'data') AS "record_data",
  (d.doc -> 'metadata') AS "metadata",
  d.doc AS "data"
FROM "public"."resources" r
JOIN "public"."credentials" c ON c.id = r.tenant_id
CROSS JOIN LATERAL (SELECT os_analytics_internal."dm_crm_contacts"(r.data::jsonb, (SELECT mk.key FROM os_analytics_internal.mask_key mk WHERE mk.id = 1)) AS doc) d
WHERE r.vertical = 'crm' AND r.resource_type = 'contacts'
  AND os_analytics_internal.visible(c.owner_tenant_id, r.vertical);
CREATE VIEW "os_analytics_v1"."sync_status" WITH (security_barrier) AS
SELECT j.id AS job_id, j.connection_id, c.owner_tenant_id, j.vertical, j.platform, j.status,
  os_analytics_internal.try_jsonb(j.progress) AS progress,
  to_timestamp(j.created_at / 1000.0) AS created_at, to_timestamp(j.started_at / 1000.0) AS started_at,
  to_timestamp(j.completed_at / 1000.0) AS completed_at
FROM "public"."sync_jobs" j
JOIN "public"."credentials" c ON c.id = j.connection_id
WHERE os_analytics_internal.visible(c.owner_tenant_id, j.vertical);
CREATE VIEW "os_analytics_v1"."tenants" WITH (security_barrier) AS
SELECT t.id AS tenant_id, t.name, to_timestamp(t.created_at / 1000.0) AS created_at, to_timestamp(t.updated_at / 1000.0) AS updated_at
FROM "public"."tenants" t
WHERE os_analytics_internal.visible_tenant(t.id);
CREATE VIEW "os_analytics_pii_v1"."connections" WITH (security_barrier) AS
SELECT c.id AS connection_id, c.owner_tenant_id, c.platform, c.vertical, c.label,
  to_timestamp(c.created_at / 1000.0) AS created_at, to_timestamp(c.updated_at / 1000.0) AS updated_at,
  to_timestamp(c.expires_at / 1000.0) AS expires_at, to_timestamp(c.last_refresh_at / 1000.0) AS last_refresh_at,
  c.last_refresh_status
FROM "public"."credentials" c
WHERE os_analytics_internal.visible(c.owner_tenant_id, c.vertical);
CREATE VIEW "os_analytics_pii_v1"."crm_contacts" WITH (security_barrier) AS
SELECT
  r.tenant_id AS "connection_id",
  c.owner_tenant_id AS "owner_tenant_id",
  r.platform AS "platform",
  r.vertical AS "vertical",
  r.resource_id AS "resource_id",
  to_timestamp(r.fetched_at / 1000.0) AS "fetched_at",
  to_timestamp(r.updated_at / 1000.0) AS "updated_at",
  to_timestamp(COALESCE(r.changed_at, r.updated_at) / 1000.0) AS "changed_at",
  r.norm_version AS "norm_version",
  (d.doc ->> 'id') AS "id",
  (d.doc ->> 'first_name') AS "first_name",
  (d.doc ->> 'email') AS "email",
  (d.doc ->> 'phone') AS "phone",
  (d.doc ->> 'national_id') AS "national_id",
  (d.doc -> 'address') AS "address",
  os_analytics_internal.try_numeric(d.doc ->> 'amount') AS "amount",
  os_analytics_internal.try_boolean(d.doc ->> 'active') AS "active",
  os_analytics_internal.try_timestamptz(d.doc ->> 'created_at') AS "created_at",
  os_analytics_internal.try_timestamptz(d.doc ->> 'updated_at') AS "record_updated_at",
  os_analytics_internal.try_date(d.doc ->> 'birthDate') AS "birth_date",
  os_analytics_internal.try_timestamptz(d.doc ->> 'due_date') AS "due_date",
  (d.doc -> 'telephones') AS "telephones",
  (d.doc ->> 'stage') AS "stage",
  (d.doc ->> 'data') AS "record_data",
  (d.doc -> 'metadata') AS "metadata",
  d.doc AS "data"
FROM "public"."resources" r
JOIN "public"."credentials" c ON c.id = r.tenant_id
CROSS JOIN LATERAL (SELECT os_analytics_internal."dp_crm_contacts"(r.data::jsonb, NULL::bytea) AS doc) d
WHERE r.vertical = 'crm' AND r.resource_type = 'contacts'
  AND os_analytics_internal.visible(c.owner_tenant_id, r.vertical);
CREATE VIEW "os_analytics_pii_v1"."sync_status" WITH (security_barrier) AS
SELECT j.id AS job_id, j.connection_id, c.owner_tenant_id, j.vertical, j.platform, j.status,
  os_analytics_internal.try_jsonb(j.progress) AS progress,
  to_timestamp(j.created_at / 1000.0) AS created_at, to_timestamp(j.started_at / 1000.0) AS started_at,
  to_timestamp(j.completed_at / 1000.0) AS completed_at
FROM "public"."sync_jobs" j
JOIN "public"."credentials" c ON c.id = j.connection_id
WHERE os_analytics_internal.visible(c.owner_tenant_id, j.vertical);
CREATE VIEW "os_analytics_pii_v1"."tenants" WITH (security_barrier) AS
SELECT t.id AS tenant_id, t.name, to_timestamp(t.created_at / 1000.0) AS created_at, to_timestamp(t.updated_at / 1000.0) AS updated_at
FROM "public"."tenants" t
WHERE os_analytics_internal.visible_tenant(t.id);

-- 8. Stable aliases over version 2.
CREATE VIEW os_analytics."connections" WITH (security_barrier) AS SELECT * FROM "os_analytics_v2"."connections";
CREATE VIEW os_analytics."crm_contacts" WITH (security_barrier) AS SELECT * FROM "os_analytics_v2"."crm_contacts";
CREATE VIEW os_analytics."payments_charges" WITH (security_barrier) AS SELECT * FROM "os_analytics_v2"."payments_charges";
CREATE VIEW os_analytics."sync_status" WITH (security_barrier) AS SELECT * FROM "os_analytics_v2"."sync_status";
CREATE VIEW os_analytics."tenants" WITH (security_barrier) AS SELECT * FROM "os_analytics_v2"."tenants";
CREATE VIEW os_analytics_pii."connections" WITH (security_barrier) AS SELECT * FROM "os_analytics_pii_v2"."connections";
CREATE VIEW os_analytics_pii."crm_contacts" WITH (security_barrier) AS SELECT * FROM "os_analytics_pii_v2"."crm_contacts";
CREATE VIEW os_analytics_pii."payments_charges" WITH (security_barrier) AS SELECT * FROM "os_analytics_pii_v2"."payments_charges";
CREATE VIEW os_analytics_pii."sync_status" WITH (security_barrier) AS SELECT * FROM "os_analytics_pii_v2"."sync_status";
CREATE VIEW os_analytics_pii."tenants" WITH (security_barrier) AS SELECT * FROM "os_analytics_pii_v2"."tenants";

-- 9. Grants. Readers: USAGE on their schemas, SELECT on the views, EXECUTE on
--    the internal functions the views call. Nothing on any table.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA os_analytics_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA os_analytics_internal TO "os_analytics_reader", "os_analytics_reader_pii";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA os_analytics_internal TO "os_analytics_reader", "os_analytics_reader_pii";
GRANT USAGE ON SCHEMA "os_analytics", "os_analytics_v2", "os_analytics_v1" TO "os_analytics_reader";
GRANT SELECT ON ALL TABLES IN SCHEMA "os_analytics", "os_analytics_v2", "os_analytics_v1" TO "os_analytics_reader";
GRANT USAGE ON SCHEMA "os_analytics_pii", "os_analytics_pii_v2", "os_analytics_pii_v1" TO "os_analytics_reader_pii";
GRANT SELECT ON ALL TABLES IN SCHEMA "os_analytics_pii", "os_analytics_pii_v2", "os_analytics_pii_v1" TO "os_analytics_reader_pii";
GRANT USAGE ON SCHEMA os_analytics_internal TO "opensteward";
GRANT SELECT ON os_analytics_internal.catalog_versions TO "opensteward";

-- 10. Record the catalog this script was generated from.
INSERT INTO os_analytics_internal.catalog_versions (version, hash, catalog)
VALUES (2, '667d3b27717d67e10004cacc59c1b4b3c1829ba5c7078b9101fdaae1b80bdbcc', $catalog${"format":1,"views":[{"name":"connections","kind":"system","columns":[{"name":"connection_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"owner_tenant_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"platform","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"vertical","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"label","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"created_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"updated_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"expires_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"last_refresh_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"last_refresh_status","source":"store","type":"text","maskedType":"text","class":"internal"}]},{"name":"crm_contacts","kind":"resource","vertical":"crm","resourceType":"contacts","columns":[{"name":"connection_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"owner_tenant_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"platform","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"vertical","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"resource_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"fetched_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"updated_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"changed_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"norm_version","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"id","source":"field","field":"id","type":"text","maskedType":"text","class":"internal"},{"name":"first_name","source":"field","field":"first_name","type":"text","maskedType":"text","class":"pii","mask":"name"},{"name":"email","source":"field","field":"email","type":"text","maskedType":"text","class":"pii","mask":"email"},{"name":"phone","source":"field","field":"phone","type":"text","maskedType":"text","class":"pii","mask":"phone"},{"name":"national_id","source":"field","field":"national_id","type":"text","maskedType":"text","class":"pii","mask":"hmac"},{"name":"address","source":"field","field":"address","type":"jsonb","maskedType":"jsonb","class":"pii","mask":"address"},{"name":"amount","source":"field","field":"amount","type":"numeric","maskedType":"numeric","class":"financial"},{"name":"active","source":"field","field":"active","type":"boolean","maskedType":"boolean","class":"internal"},{"name":"created_at","source":"field","field":"created_at","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"record_updated_at","source":"field","field":"updated_at","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"birth_date","source":"field","field":"birthDate","type":"date","maskedType":"text","class":"pii","mask":"redact"},{"name":"due_date","source":"field","field":"due_date","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"telephones","source":"field","field":"telephones","type":"jsonb","maskedType":"jsonb","class":"pii"},{"name":"stage","source":"field","field":"stage","type":"text","maskedType":"text","class":"internal"},{"name":"record_data","source":"field","field":"data","type":"text","maskedType":"text","class":"internal"},{"name":"metadata","source":"field","field":"metadata","type":"jsonb","maskedType":"jsonb","class":"pii","mask":"redact"},{"name":"data","source":"data","type":"jsonb","maskedType":"jsonb","class":"pii"}],"rules":[{"path":"*","class":"internal"},{"path":"first_name","class":"pii","mask":"name"},{"path":"email","class":"pii","mask":"email"},{"path":"phone","class":"pii","mask":"phone"},{"path":"national_id","class":"pii","mask":"hmac"},{"path":"address","class":"pii","mask":"address"},{"path":"amount","class":"financial","mask":"redact"},{"path":"birthDate","class":"pii","mask":"redact"},{"path":"telephones[].telephone","class":"pii","mask":"phone"},{"path":"api_token","class":"secret"}]},{"name":"payments_charges","kind":"resource","vertical":"payments","resourceType":"charges","columns":[{"name":"connection_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"owner_tenant_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"platform","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"vertical","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"resource_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"fetched_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"updated_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"changed_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"norm_version","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"id","source":"field","field":"id","type":"text","maskedType":"text","class":"internal"},{"name":"amount","source":"field","field":"amount","type":"numeric","maskedType":"numeric","class":"internal"},{"name":"customer_email","source":"field","field":"customer_email","type":"text","maskedType":"text","class":"pii","mask":"email"},{"name":"data","source":"data","type":"jsonb","maskedType":"jsonb","class":"pii"}],"rules":[{"path":"*","class":"internal"},{"path":"customer_email","class":"pii","mask":"email"}],"stripFields":["raw"]},{"name":"sync_status","kind":"system","columns":[{"name":"job_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"connection_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"owner_tenant_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"vertical","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"platform","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"status","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"progress","source":"store","type":"jsonb","maskedType":"jsonb","class":"internal"},{"name":"created_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"started_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"completed_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"}]},{"name":"tenants","kind":"system","columns":[{"name":"tenant_id","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"name","source":"store","type":"text","maskedType":"text","class":"internal"},{"name":"created_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"},{"name":"updated_at","source":"store","type":"timestamptz","maskedType":"timestamptz","class":"internal"}]}]}$catalog$::jsonb)
ON CONFLICT (version, hash) DO NOTHING;
RESET ROLE;
COMMIT;
