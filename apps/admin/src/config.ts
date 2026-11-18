import { readFileSync, existsSync } from 'fs'
import { load } from 'js-yaml'
import { assertSecret } from '@opensteward/shared'

export interface Config {
  server: { port: number; host: string }
  session: { secret: string }
  admin_api: { url: string }
  /**
   * Browser-facing URL of the docs-server. Used to build absolute hrefs
   * for cross-app links (e.g. the per-platform "Guide" link on the
   * /platforms cards, the wizard step 5 "Read the integration guide"
   * callout). Browser links need an absolute URL because the admin
   * lives on a different origin than docs-server in every deployment
   * shape we ship — `localhost:3000` vs `localhost:3003` in dev,
   * separate subdomains in prod.
   */
  docs_server: { url: string }
  /**
   * Browser-facing base URL of the admin-api, used to build "Sign in with
   * <IdP>" links that send the user's browser to the SSO initiation endpoint.
   * Like docs_server.url this MUST be reachable from the user's browser, never
   * a docker-service hostname. Falls back to the docker/server admin_api url.
   */
  sso: { publicBaseUrl: string }
}

export function loadConfig(): Config {
  const configPath = process.env.CONFIG_PATH ?? './config/config.yml'
  let parsed: Partial<Config> = {}
  if (existsSync(configPath)) {
    parsed = (load(readFileSync(configPath, 'utf8')) as Partial<Config>) ?? {}
  }
  // ADMIN_API_URL env var always wins over YAML, so the same config.yml works
  // in `pnpm dev` (localhost) and Docker (service-name DNS).
  const adminApiUrl = process.env.ADMIN_API_URL ?? parsed.admin_api?.url ?? 'http://localhost:3001'
  // DOCS_SERVER_URL is the OPERATOR's browser-facing URL — never a
  // docker-service hostname (`docs-server:3003` doesn't resolve from a
  // user's browser). Default to localhost for the `pnpm dev` workflow;
  // override per deployment.
  const docsServerUrl = process.env.DOCS_SERVER_URL ?? parsed.docs_server?.url ?? 'http://localhost:3003'
  // Browser-facing admin-api URL for SSO redirect links. Defaults to the
  // localhost dev port; in Docker the operator sets SSO_PUBLIC_BASE_URL to the
  // public admin-api origin.
  const ssoPublicBaseUrl =
    process.env.SSO_PUBLIC_BASE_URL ?? parsed.sso?.publicBaseUrl ?? 'http://localhost:3001'
  // Env wins, like every URL above. `config/config.yml` ships
  // `session.secret: change-me-…` AND compose mounts that file into the
  // container, so if YAML won, a deployment that set SESSION_SECRET correctly
  // would still sign its session cookies with the placeholder committed to
  // the public repo — and anyone who could reach the admin UI could forge an
  // admin session.
  //
  // Whichever value wins goes through assertSecret, so a committed
  // placeholder can never sign production cookies. YAML stays the fallback so
  // a bare `pnpm dev` boots without an .env — in development assertSecret
  // warns and returns the value; in production it throws, which is the right
  // outcome for a placeholder signing key.
  const sessionSecret = assertSecret(
    'SESSION_SECRET',
    process.env.SESSION_SECRET || parsed.session?.secret,
  )
  return {
    server: parsed.server ?? { port: 3000, host: '0.0.0.0' },
    session: { secret: sessionSecret },
    admin_api: { url: adminApiUrl },
    docs_server: { url: docsServerUrl.replace(/\/+$/, '') },
    sso: { publicBaseUrl: ssoPublicBaseUrl.replace(/\/+$/, '') },
  }
}
