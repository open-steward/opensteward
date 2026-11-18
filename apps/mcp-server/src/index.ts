#!/usr/bin/env node
/**
 * OpenSteward MCP server — read-only adapter exposing customer
 * data to AI agents.
 *
 * Two modes, picked from the supplied token:
 *
 *   OPENSTEWARD_MCP_KEY    starts with `osk_` → tenant mode
 *   OPENSTEWARD_USER_TOKEN starts with `eut_` → end-user mode
 *
 * For convenience, OPENSTEWARD_TOKEN can be set as a single var
 * and the prefix decides the mode automatically.
 *
 * A tenant key must carry the `mcp:read` scope. It is an ordinary API
 * key with that scope, not a separate credential — but without it the
 * server's MCP guards do not engage, so the deployment refuses one.
 *
 * The server validates the token at boot by hitting a cheap read
 * endpoint. An invalid, revoked, or non-MCP key aborts there, with the
 * deployment's own message, before the agent connects.
 *
 * It then asks which verticals the deployment serves this token
 * (`GET /v1/capabilities`, or `/v1/me/capabilities` in end-user mode) and
 * registers resource tools for those only. If the deployment cannot say,
 * every tool is registered and a warning goes to stderr.
 *
 * (It does not police write scopes itself: the mint guard rejects
 * `mcp:read` alongside any write-granting scope, and the auth layer
 * refuses a non-GET from an `mcp:read` principal.)
 */
import { RestClient, type ClientMode } from './rest-client.js'
import { buildTools, registeredVerticals } from './tool-registry.js'
import { startStdioServer } from './transport/stdio.js'
import { createRequire } from 'node:module'

const PKG_NAME = '@opensteward/mcp-server'
// Read from package.json rather than duplicated as a literal — a duplicated
// version constant drifts stale.
const PKG_VERSION = readPackageVersion()

/**
 * The published version, straight from package.json. `createRequire` rather
 * than a JSON import so this works identically under `tsc` output and under
 * vitest running the TypeScript source, without needing import assertions.
 */
function readPackageVersion(): string {
  const require = createRequire(import.meta.url)
  const pkg = require('../package.json') as { version?: string }
  return pkg.version ?? '0.0.0'
}

interface Env {
  baseUrl: string
  token: string
  mode: ClientMode
  disarm: boolean
  transport: 'stdio' | 'http'
}

function readEnv(env: Record<string, string | undefined>): Env {
  const baseUrl = env['OPENSTEWARD_BASE_URL']?.trim()
  if (!baseUrl) die('OPENSTEWARD_BASE_URL is required (e.g. https://oi.acme.example.com).')

  // OPENSTEWARD_API_KEY is accepted as a deprecated alias for
  // OPENSTEWARD_MCP_KEY — the SDK uses OPENSTEWARD_API_KEY for a genuine
  // general-purpose key, and the distinct name avoids that collision
  // (the value here must carry `mcp:read`, not be any API key).
  const mcpKey = env['OPENSTEWARD_MCP_KEY']?.trim()
  const legacyKey = env['OPENSTEWARD_API_KEY']?.trim()
  if (mcpKey && legacyKey && mcpKey !== legacyKey) {
    die(
      'OPENSTEWARD_MCP_KEY and OPENSTEWARD_API_KEY are both set to different values. Keep OPENSTEWARD_MCP_KEY and remove the other.',
    )
  }
  if (!mcpKey && legacyKey) {
    process.stderr.write(
      `[mcp-server] warning: OPENSTEWARD_API_KEY is deprecated — rename it to OPENSTEWARD_MCP_KEY. ` +
        `The key must carry the 'mcp:read' scope.\n`,
    )
  }
  const tenantKey = mcpKey ?? legacyKey
  const userToken = env['OPENSTEWARD_USER_TOKEN']?.trim()
  const generic = env['OPENSTEWARD_TOKEN']?.trim()

  // Disambiguate mode by env var. Two named vars for self-documenting
  // configs; one shared var for terse local dev where the prefix
  // decides.
  let token: string | undefined
  let mode: ClientMode | undefined
  if (tenantKey && userToken) {
    die('Set only one of OPENSTEWARD_MCP_KEY or OPENSTEWARD_USER_TOKEN, not both.')
  }
  if (tenantKey) {
    token = tenantKey
    mode = 'tenant'
  } else if (userToken) {
    token = userToken
    mode = 'end-user'
  } else if (generic) {
    token = generic
    mode = generic.startsWith('eut_') ? 'end-user' : 'tenant'
  }
  if (!token) {
    die(
      'No token configured. Set one of: OPENSTEWARD_MCP_KEY (tenant — an API ' +
        "key carrying the 'mcp:read' scope), OPENSTEWARD_USER_TOKEN (end-user), " +
        'or OPENSTEWARD_TOKEN (auto-detect).',
    )
  }

  // Soft prefix sanity check — warn but don't block, since operators
  // sometimes mint custom-prefixed keys.
  if (mode === 'tenant' && !token.startsWith('osk_')) {
    process.stderr.write(
      `[mcp-server] warning: tenant token does not start with 'osk_' — proceeding anyway.\n`,
    )
  }
  if (mode === 'end-user' && !token.startsWith('eut_')) {
    process.stderr.write(
      `[mcp-server] warning: end-user token does not start with 'eut_' — proceeding anyway.\n`,
    )
  }

  const disarm = (env['MCP_DISARM'] ?? '').toLowerCase() === 'strict'
  const transport = (env['MCP_TRANSPORT'] ?? 'stdio').toLowerCase() === 'http' ? 'http' : 'stdio'

  return { baseUrl: baseUrl!, token: token!, mode: mode!, disarm, transport }
}

function die(message: string): never {
  process.stderr.write(`[mcp-server] ${message}\n`)
  process.exit(1)
}

async function main(): Promise<void> {
  const env = readEnv(process.env)

  if (env.transport === 'http') {
    die('HTTP transport is not yet implemented. Set MCP_TRANSPORT=stdio (the default).')
  }

  const client = new RestClient({ baseUrl: env.baseUrl, token: env.token, mode: env.mode })

  // Boot-time token probe — one cheap read, before the agent connects.
  //
  // It carries more weight than it looks: the deployment refuses an MCP client
  // whose key lacks `mcp:read` (403 MCP_KEY_REQUIRED), and RestClient puts the
  // server's whole error object into the thrown message. So the remedy an
  // operator reads here is the deployment's own wording, not a guess made
  // locally — this file never has to know why a key was rejected.
  try {
    await client.validateToken()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    die(
      `Token probe failed against ${env.baseUrl}: ${msg}. ` +
        `Verify OPENSTEWARD_BASE_URL, that the key carries \`mcp:read\` plus the ` +
        `read scopes the agent needs, and that the integration-server is reachable.`,
    )
  }

  // Which verticals this deployment serves this token (GET /v1/capabilities, or
  // /v1/me/capabilities in end-user mode). Cosmetic: tools for a vertical it does
  // not serve are not offered, and it refuses such calls anyway (a 403 license
  // refusal, or a 404 in end-user mode for a vertical /v1/me does not mount).
  // Read once — restart this server after a license change. Any failure
  // registers every tool, never none.
  const FALLBACK =
    'registering every tool; the deployment still refuses calls to a vertical it does not serve'
  let verticals: string[] | undefined
  try {
    verticals = await client.getCapabilities()
    // undefined covers a 404 and a 2xx that is not a verticals list, so the
    // hint names both: an older release, or something else answering for it.
    if (verticals === undefined) {
      process.stderr.write(
        `[mcp-server] warning: ${env.baseUrl} does not report its enabled verticals ` +
          `(an older release, or a proxy or catch-all page answering in its place?); ${FALLBACK}.\n`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(
      `[mcp-server] warning: could not read the enabled verticals (${msg}); ${FALLBACK}.\n`,
    )
  }

  const tools = buildTools({ mode: env.mode, client, sanitize: { disarm: env.disarm }, verticals })

  // `serveStdio` returns synchronously and keeps serving until the transport
  // closes — there is nothing to await, unlike v1's `server.connect()`. The
  // agent owns our lifecycle, so the handle is only needed to close cleanly on
  // a signal; without these the process would ignore SIGTERM mid-request.
  const handle = startStdioServer({ name: PKG_NAME, version: PKG_VERSION, tools })
  // Say so. Every failure path here writes to stderr and exits; without this
  // line success would write nothing, and a working server would look
  // identical to a hung one in an agent runner's log — and to anything trying
  // to tell "booted" from "still starting". stdout is the MCP transport, so
  // this goes to stderr like every other line we emit.
  // Counts the verticals that got tools, not the raw list: a name this release
  // does not know, or a duplicate, registers nothing.
  const served = verticals === undefined ? undefined : registeredVerticals(verticals).length
  const scope =
    served === undefined ? 'all verticals' : `${served} enabled vertical${served === 1 ? '' : 's'}`
  process.stderr.write(
    `[mcp-server] ready — ${env.mode} mode, ${tools.length} tools (${scope}), ${env.baseUrl}\n`,
  )
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void handle.close().finally(() => process.exit(0))
    })
  }
}

main().catch((err) => {
  process.stderr.write(
    `[mcp-server] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exit(1)
})
