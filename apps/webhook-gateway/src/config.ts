import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { load } from 'js-yaml'
import { resolveDbConfig, type ResolvedDbConfig } from '@opensteward/shared'

export interface PlatformConfig {
  vertical: string
  url: string
  secret: string
}

export interface Config {
  server: { port: number; host: string }
  db: ResolvedDbConfig
  platforms: Record<string, PlatformConfig>
}

interface RawConfig {
  server?: { port?: number; host?: string }
  db?: { path?: string }
  platforms?: Record<string, PlatformConfig>
}

export function loadConfig(): Config {
  const configPath = process.env.CONFIG_PATH ?? resolve(process.cwd(), 'config/config.yml')
  const parsed: RawConfig = existsSync(configPath)
    ? (load(readFileSync(configPath, 'utf8')) as RawConfig)
    : {}

  // DATABASE_URL (when set) selects Postgres; otherwise SQLite at the YAML /
  // default path. Mirrors the secret-from-env pattern: env wins over YAML.
  const sqlitePath = parsed.db?.path ?? './data/webhook-gateway.db'

  return {
    server: {
      port: parsed.server?.port ?? 3004,
      host: parsed.server?.host ?? '0.0.0.0',
    },
    db: resolveDbConfig(process.env, { sqlitePath }),
    platforms: applyUpstreamOverride(
      parsed.platforms ?? {},
      process.env.INTEGRATION_SERVER_URL,
    ),
  }
}

/**
 * Point every platform at `INTEGRATION_SERVER_URL` when it is set.
 *
 * `config/config.yml` ships `http://localhost:3010`, which is right for local
 * dev and wrong in a container — there `localhost` is the gateway itself, so
 * forwards hit ECONNREFUSED. Compose mounts that same file read-only, so the
 * checked-in default cannot simply be changed to a service name without
 * breaking local dev. Overriding from env keeps both correct and matches how
 * admin-api and docs-server already take their upstream, plus this loader's
 * own "env wins over YAML" rule.
 *
 * Only `url` is replaced; `vertical` and `secret` are per-platform and stay.
 * An unset or empty value is ignored rather than blanking the upstream.
 */
function applyUpstreamOverride(
  platforms: Record<string, PlatformConfig>,
  upstream: string | undefined,
): Record<string, PlatformConfig> {
  if (!upstream) return platforms
  return Object.fromEntries(
    Object.entries(platforms).map(([slug, cfg]) => [slug, { ...cfg, url: upstream }]),
  )
}
