import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { load } from 'js-yaml'
import { assertSecret, resolveDbConfig, type ResolvedDbConfig } from '@opensteward/shared'
import { resolveSupersetConfig, type SupersetConfig } from './core/analytics/superset-client'

export interface VerticalConfig {
  name: string
  url: string
  admin_secret: string
}

export interface Config {
  server: { port: number; host: string }
  jwt: { secret: string; expiresIn: string }
  db: ResolvedDbConfig
  verticals: VerticalConfig[]
  /** Master secret for encrypting SSO provider secrets at rest (AES-256-GCM). */
  storeSecret: string
  /** Optional one-time bootstrap token. When set, `POST /api/auth/setup` requires a
   *  matching `X-Bootstrap-Token` header, gating first-run admin creation against an
   *  attacker who reaches a fresh (or wiped) deployment. Unset = no token gate. */
  bootstrapToken?: string
  sso: {
    /** Public base URL of THIS admin-api, where IdPs send SAML ACS / OIDC
     *  callbacks (e.g. https://admin-api.acme.com). */
    publicBaseUrl: string
    /** Public base URL of the admin UI, where the post-login handoff lands. */
    adminUiUrl: string
  }
  /** Embedded Apache Superset (optional; Postgres deployments). Null = off —
   *  the feature is on only when SUPERSET_URL is set. Env-only: never YAML. */
  superset?: SupersetConfig | null
}

export function loadConfig(): Config {
  const configPath = process.env.CONFIG_PATH ?? resolve(process.cwd(), 'config/config.yml')
  const defaults: Config = {
    server: { port: 3001, host: '0.0.0.0' },
    jwt: {
      secret: assertSecret('JWT_SECRET', process.env.JWT_SECRET),
      // Env-overridable because the `jwt` block below is taken wholesale from
      // these defaults whenever JWT_SECRET is set — which is every real
      // deployment — so a YAML `jwt.expiresIn` would never be read there.
      expiresIn: process.env.JWT_EXPIRES_IN?.trim() || '24h',
    },
    // DATABASE_URL (when set) selects Postgres; otherwise SQLite at the YAML /
    // default path. Env wins over YAML, like the secrets below.
    db: resolveDbConfig(process.env, { sqlitePath: './data/admin.db' }),
    verticals: [],
    // STORE_SECRET is required for SSO secret encryption. Reuses the same
    // deployment-wide secret as the integration-server credential store.
    storeSecret: assertSecret('STORE_SECRET', process.env.STORE_SECRET),
    bootstrapToken: process.env.BOOTSTRAP_TOKEN || undefined,
    sso: {
      publicBaseUrl: process.env.SSO_PUBLIC_BASE_URL ?? 'http://localhost:3001',
      adminUiUrl: process.env.ADMIN_UI_URL ?? 'http://localhost:3000',
    },
    superset: resolveSupersetConfig({
      url: process.env.SUPERSET_URL,
      publicUrl: process.env.SUPERSET_PUBLIC_URL,
      serviceUsername: process.env.SUPERSET_SERVICE_USERNAME,
      servicePassword: process.env.SUPERSET_SERVICE_PASSWORD,
    }),
  }

  let config: Config
  if (existsSync(configPath)) {
    const parsed = load(readFileSync(configPath, 'utf8')) as Partial<Config>
    const yamlSqlitePath = (parsed as { db?: { path?: string } }).db?.path
    config = {
      ...defaults,
      ...parsed,
      // Never let YAML override secrets/topology resolved from env above.
      storeSecret: defaults.storeSecret,
      // Same rule for the JWT signing secret, but conditional: config.yml ships
      // a placeholder `jwt.secret`, and docker-compose.yml mounts that file into
      // the container, so an unconditional `...parsed` let the repo's placeholder
      // silently outrank the deployment's JWT_SECRET. Env wins whenever it is set.
      //
      // Deliberately NOT `jwt: defaults.jwt` unconditionally. With JWT_SECRET
      // unset, `assertSecret` warns and returns '' outside production, and
      // @fastify/jwt then refuses to register at all ("missing secret") — that
      // would make a bare `pnpm dev` unbootable without an .env. YAML stays the
      // local-dev fallback; it only loses when a real env value exists.
      jwt: process.env.JWT_SECRET ? defaults.jwt : (parsed.jwt ?? defaults.jwt),
      // Same rule as `jwt` above, per-field: YAML is the local fallback, but a
      // set environment variable always wins. Spreading `parsed.sso` last let a
      // committed `sso:` block outrank SSO_PUBLIC_BASE_URL / ADMIN_UI_URL —
      // silently pointing SAML ACS / OIDC callbacks and the post-login handoff
      // at whatever the file said. `defaults.sso` can't simply be re-pinned:
      // it folds in hardcoded localhost fallbacks, which would then beat YAML.
      sso: {
        ...defaults.sso,
        ...(parsed.sso ?? {}),
        ...(process.env.SSO_PUBLIC_BASE_URL
          ? { publicBaseUrl: process.env.SSO_PUBLIC_BASE_URL }
          : {}),
        ...(process.env.ADMIN_UI_URL ? { adminUiUrl: process.env.ADMIN_UI_URL } : {}),
      },
      // Superset holds a service-account password: env only, like the secrets.
      superset: defaults.superset,
      // YAML may set the SQLite path; DATABASE_URL still wins for the backend.
      db: resolveDbConfig(process.env, { sqlitePath: yamlSqlitePath ?? './data/admin.db' }),
    } as Config
  } else {
    config = defaults
  }

  // Allow env overrides for the per-vertical URL aliases — every alias now
  // points at the unified `integration-server`, e.g.
  //   INTEGRATION_SERVER_URL=http://integration-server:3010
  //   ACCOUNTING_URL=http://integration-server:3010   (same target)
  // This makes the same config.yml work in dev (localhost) and Docker
  // (service-name DNS) without per-environment YAML files.
  config.verticals = config.verticals.map((v) => {
    const upper = v.name.toUpperCase().replace(/-/g, '_')
    const urlOverride = process.env[`${upper}_URL`]
    const secretOverride = process.env[`${upper}_ADMIN_SECRET`]
    return {
      ...v,
      url: urlOverride ?? v.url,
      admin_secret: secretOverride ?? v.admin_secret,
    }
  })

  return config
}
