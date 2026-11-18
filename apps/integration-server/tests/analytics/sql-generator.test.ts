/**
 * The provisioning DDL, snapshot-tested: a reviewer reads exactly what a
 * deploy runs. Plus the pieces a snapshot would not explain — the masking
 * expression's rule order, principal statements, and quoting.
 */
import { describe, it, expect } from 'vitest'
import {
  createPrincipalStatements,
  docExpression,
  generateProvisionScript,
  revokePrincipalStatements,
  roleNames,
  rotatePrincipalStatements,
  terminateSessionsStatement,
} from '../../src/analytics/sql-generator'
import { buildCatalog } from '../../src/analytics/view-catalog'
import { generatePassword, principalRoleName, scramVerifier } from '../../src/analytics/provisioner'
import { CONTACT_CLASSIFICATION, FIXTURE_TABLES, fixtureCatalog } from './fixtures'

const VERIFIER =
  'SCRAM-SHA-256$4096:c2FsdHNhbHRzYWx0c2FsdA==$c3RvcmVkLWtleS1zdG9yZWQta2V5LXN0b3JlZC1rZXk=:c2VydmVyLWtleS1zZXJ2ZXIta2V5LXNlcnZlci1rZXk='

describe('generateProvisionScript', () => {
  it('matches the snapshot (fixture catalog, one retained version)', async () => {
    const catalog = fixtureCatalog()
    const retainedViews = catalog.views.filter((v) => v.name !== 'payments_charges')
    const script = generateProvisionScript({
      prefix: 'os',
      version: 2,
      catalog,
      retained: [{ version: 1, catalog: { views: retainedViews } }],
      tables: FIXTURE_TABLES,
      appRole: 'opensteward',
      standalone: true,
    })
    await expect(script).toMatchFileSnapshot('./__snapshots__/provision-fixture.sql')
  })

  it('is deterministic for the real catalog', () => {
    const opts = {
      prefix: 'os',
      version: 1,
      catalog: buildCatalog(),
      tables: FIXTURE_TABLES,
    }
    expect(generateProvisionScript(opts)).toBe(generateProvisionScript(opts))
  })

  it('omits the system views whose tables are absent', () => {
    const script = generateProvisionScript({
      prefix: 'os',
      version: 1,
      catalog: fixtureCatalog(),
      tables: { ...FIXTURE_TABLES, syncJobs: null, tenants: null },
    })
    expect(script).not.toMatch(/CREATE VIEW .*"tenants"/)
    expect(script).not.toMatch(/CREATE VIEW .*"sync_status"/)
    expect(script).toMatch(/os_analytics\."connections"/)
    expect(script).not.toMatch(/^BEGIN;/m)
  })

  it('never grants a reader anything on a base table', () => {
    const script = generateProvisionScript({
      prefix: 'os',
      version: 1,
      catalog: fixtureCatalog(),
      tables: FIXTURE_TABLES,
    })
    for (const line of script.split('\n').filter((l) => /^GRANT /.test(l))) {
      if (/"public"\./.test(line)) expect(line).toMatch(/TO "os_analytics_owner";$/)
    }
    // The owner never reads the encrypted credential blob.
    expect(script).toMatch(/GRANT SELECT \(id, platform, vertical, owner_tenant_id, label,/)
    expect(script).not.toMatch(/GRANT SELECT ON "public"\."credentials"/)
  })

  it('uses the deployment prefix for every role', () => {
    expect(roleNames('acme')).toEqual({
      owner: 'acme_analytics_owner',
      reader: 'acme_analytics_reader',
      readerPii: 'acme_analytics_reader_pii',
    })
    expect(() => roleNames('Bad-Prefix')).toThrow(/ANALYTICS_ROLE_PREFIX/)
    expect(() => roleNames('x'.repeat(17))).toThrow()
  })
})

describe('docExpression', () => {
  it('masked: fallback first, then explicit rules shallowest first; financial kept', () => {
    const e = docExpression(CONTACT_CLASSIFICATION, false)
    // Outermost call is the deepest rule, applied last.
    expect(e.startsWith(`os_analytics_internal.apply_rule(`)).toBe(true)
    expect(e).toContain(
      `ARRAY['telephones', 'telephone']::text[], ARRAY[true, false]::boolean[], 1, 'mask', 'phone'`,
    )
    expect(e).toContain(`ARRAY['api_token']::text[], ARRAY[false]::boolean[], 1, 'remove', NULL`)
    expect(e).toContain(`ARRAY['national_id']::text[], ARRAY[false]::boolean[], 1, 'mask', 'hmac'`)
    expect(e).not.toContain(`'amount'`.concat(']::text[], ARRAY[false]'))
    expect(e).toMatch(
      /apply_fallback\(d, ARRAY\[.*\]::text\[\], ARRAY\['metadata', 'raw'\]::text\[\], 'mask', NULL, NULL, k\)/,
    )
    // Nested calls read inside-out: the fallback is innermost (first in the
    // text), the deepest rule outermost (its arguments last).
    const at = (needle: string) => e.indexOf(needle)
    expect(at('apply_fallback')).toBeLessThan(at(`ARRAY['email']`))
    expect(at(`ARRAY['email']`)).toBeLessThan(at(`ARRAY['telephones', 'telephone']`))
  })

  it('unmasked: only secrets are removed', () => {
    const e = docExpression(CONTACT_CLASSIFICATION, true)
    expect(e).toBe(
      `os_analytics_internal.apply_rule(d, ARRAY['api_token']::text[], ARRAY[false]::boolean[], 1, 'remove', NULL, k)`,
    )
  })

  it('strips fields before anything else', () => {
    expect(docExpression({ '*': { class: 'internal' } }, true, ['raw'])).toBe(`(d - 'raw')`)
  })

  it('a pii default masks every unaddressed field', () => {
    const e = docExpression(
      { '*': { class: 'pii', mask: 'redact' }, id: { class: 'public' } },
      false,
    )
    expect(e).toBe(
      `os_analytics_internal.apply_fallback(d, ARRAY['id']::text[], ARRAY['metadata', 'raw']::text[], 'mask', 'mask', 'redact', k)`,
    )
  })

  it('escapes hostile paths as literals', () => {
    const e = docExpression({ "a'); DROP TABLE x; --": { class: 'secret' } }, false)
    expect(e).toContain(`ARRAY['a''); DROP TABLE x; --']::text[]`)
  })
})

describe('principal statements', () => {
  it('create: login, limits, read-only defaults, scope rows (snapshot)', () => {
    const s = createPrincipalStatements({
      prefix: 'os',
      roleName: 'os_sql_metabase_abc123',
      passwordVerifier: VERIFIER,
      pii: false,
      connectionLimit: 5,
      validUntil: new Date('2027-01-01T00:00:00.000Z'),
      scope: { tenants: ['t1', "o'brien"], verticals: ['crm'] },
    })
    expect(s).toMatchInlineSnapshot(`
      [
        "CREATE ROLE "os_sql_metabase_abc123" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT CONNECTION LIMIT 5 PASSWORD 'SCRAM-SHA-256$4096:c2FsdHNhbHRzYWx0c2FsdA==$c3RvcmVkLWtleS1zdG9yZWQta2V5LXN0b3JlZC1rZXk=:c2VydmVyLWtleS1zZXJ2ZXIta2V5LXNlcnZlci1rZXk=' VALID UNTIL '2027-01-01T00:00:00.000Z';",
        "GRANT "os_analytics_reader" TO "os_sql_metabase_abc123";",
        "GRANT "os_sql_metabase_abc123" TO CURRENT_USER;",
        "ALTER ROLE "os_sql_metabase_abc123" SET default_transaction_read_only = on;",
        "ALTER ROLE "os_sql_metabase_abc123" SET statement_timeout = '60s';",
        "ALTER ROLE "os_sql_metabase_abc123" SET idle_in_transaction_session_timeout = '5min';",
        "ALTER ROLE "os_sql_metabase_abc123" SET search_path = os_analytics;",
        "DELETE FROM os_analytics_internal.principal_scopes WHERE role_name = 'os_sql_metabase_abc123';",
        "DELETE FROM os_analytics_internal.principal_all_scope WHERE role_name = 'os_sql_metabase_abc123';",
        "INSERT INTO os_analytics_internal.principal_scopes (role_name, owner_tenant_id, vertical) VALUES ('os_sql_metabase_abc123', 't1', 'crm');",
        "INSERT INTO os_analytics_internal.principal_scopes (role_name, owner_tenant_id, vertical) VALUES ('os_sql_metabase_abc123', 'o''brien', 'crm');",
      ]
    `)
  })

  it('create: an all-tenant PII principal', () => {
    const s = createPrincipalStatements({
      prefix: 'os',
      roleName: 'os_sql_dwh_000000',
      passwordVerifier: VERIFIER,
      pii: true,
      connectionLimit: 2,
      validUntil: null,
      scope: { tenants: '*' },
    })
    expect(s[0]).toMatch(/VALID UNTIL 'infinity';$/)
    expect(s[1]).toBe('GRANT "os_analytics_reader_pii" TO "os_sql_dwh_000000";')
    expect(s).toContain('ALTER ROLE "os_sql_dwh_000000" SET search_path = os_analytics_pii;')
    expect(s.at(-1)).toBe(
      "INSERT INTO os_analytics_internal.principal_all_scope (role_name, vertical) VALUES ('os_sql_dwh_000000', '*');",
    )
  })

  it('refuses a plaintext password or a hostile role name', () => {
    const base = {
      prefix: 'os',
      roleName: 'os_sql_x_000000',
      passwordVerifier: VERIFIER,
      pii: false,
      connectionLimit: 1,
      validUntil: null,
      scope: { tenants: '*' as const },
    }
    expect(() => createPrincipalStatements({ ...base, passwordVerifier: 'hunter2' })).toThrow(
      /SCRAM/,
    )
    expect(() =>
      createPrincipalStatements({ ...base, roleName: 'x"; DROP ROLE postgres; --' }),
    ).toThrow(/invalid role name/)
    expect(() => rotatePrincipalStatements('os_sql_x_000000', 'plain')).toThrow(/SCRAM/)
    expect(() => terminateSessionsStatement("x' OR '1'='1")).toThrow(/invalid role name/)
  })

  it('revoke: no login, no membership, no scope', () => {
    expect(revokePrincipalStatements('os', 'os_sql_x_000000')).toEqual([
      'ALTER ROLE "os_sql_x_000000" WITH NOLOGIN;',
      'REVOKE "os_analytics_reader", "os_analytics_reader_pii" FROM "os_sql_x_000000";',
      "DELETE FROM os_analytics_internal.principal_scopes WHERE role_name = 'os_sql_x_000000';",
      "DELETE FROM os_analytics_internal.principal_all_scope WHERE role_name = 'os_sql_x_000000';",
    ])
  })
})

describe('passwords and names', () => {
  it('generates long random passwords and SCRAM verifiers', () => {
    const a = generatePassword()
    expect(a).toMatch(/^[A-Za-z0-9]{40}$/)
    expect(generatePassword()).not.toBe(a)
    // RFC 7677 test vector: user "user", password "pencil", salt W22ZaJ0SNY7soEsUEjb6gQ==.
    const v = scramVerifier('pencil', 4096, Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'))
    expect(v).toBe(
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    )
  })

  it('builds a safe, unique role name from any label', () => {
    expect(principalRoleName('os', 'Metabase (prod)', 'a1b2c3')).toBe('os_sql_metabase_prod_a1b2c3')
    expect(principalRoleName('os', `'; DROP ROLE x; --`, 'a1b2c3')).toBe(
      'os_sql_drop_role_x_a1b2c3',
    )
    expect(principalRoleName('os', '!!!', 'a1b2c3')).toBe('os_sql_principal_a1b2c3')
    const long = principalRoleName('os', 'y'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(63)
    expect(long).toMatch(/^os_sql_y+_[0-9a-f]{6}$/)
  })
})
