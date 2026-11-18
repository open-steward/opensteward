/**
 * The MCP guards: kill switch, read-only enforcement, and the scope an MCP
 * client must carry.
 *
 * A leaf module, like `api-key-resolver` and `vertical-scopes`: the sandbox
 * applies all three, and `api-key-middleware` reaches the OIDC verifier and,
 * through it, the network — which the sandbox's import graph must not
 * include. Pure request/reply logic; nothing here opens a socket.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'

/** What a source returns instead of `false` when the license withholds MCP (P10). Sent as `{ error }`. */
export interface McpRefusal {
  code: string
  message: string
}

/**
 * Resolves, at request time, whether MCP traffic is allowed. A function rather
 * than a boolean so a flip in the admin UI takes effect on the next settings
 * poll instead of needing a redeploy — which is exactly what the setting
 * advertises. `true` allows. `false` is the `features.mcp_enabled` kill switch
 * (MCP_DISABLED). A refusal names who said no: in integration-server, the
 * license, because the setting can disable MCP but never grant it (P10).
 */
export type McpEnabledSource = () => boolean | McpRefusal

/**
 * What `@opensteward/mcp-server` sends as its User-Agent, set in that package's
 * `rest-client.ts`. Matched as a prefix so a future version suffix still counts.
 */
export const MCP_CLIENT_USER_AGENT = '@opensteward/mcp-server'

/**
 * Emergency kill switch for AI-agent traffic.
 *
 * `features.mcp_enabled = false` refuses every principal carrying
 * `mcp:read`, whatever else it is scoped for, and leaves ordinary developer
 * keys untouched. Operators reach for this when an agent misbehaves and they
 * need the blast radius closed now, without a deploy.
 *
 * Returns true when the request was refused (403 already sent), so callers
 * read as `if (await refuseIfMcpDisabled(...)) return`.
 */
export async function refuseIfMcpDisabled(
  reply: FastifyReply,
  scopes: readonly string[],
  mcpEnabled: McpEnabledSource | undefined,
): Promise<boolean> {
  if (!scopes.includes('mcp:read')) return false
  if (mcpEnabled === undefined) return false
  // Compared with `=== true`, never truthiness: a refusal object is truthy,
  // and reading it as "enabled" would let the license's no through.
  const verdict = mcpEnabled()
  if (verdict === true) return false
  await reply.status(403).send({
    // Anything that is not a well-formed refusal (`false`, or an untyped
    // caller's undefined/garbage) is the kill switch's envelope: still a clean
    // 403, never a TypeError surfacing as a 500.
    error: isMcpRefusal(verdict)
      ? { code: verdict.code, message: verdict.message }
      : {
          code: 'MCP_DISABLED',
          message:
            'MCP access is disabled on this deployment. An operator set ' +
            'features.mcp_enabled = false.',
        },
  })
  return true
}

function isMcpRefusal(v: unknown): v is McpRefusal {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Partial<Record<keyof McpRefusal, unknown>>
  return typeof r.code === 'string' && typeof r.message === 'string'
}

/**
 * Read-only enforcement for `mcp:read` principals: any non-GET is refused at
 * the auth layer, whatever tools the client believes it has.
 *
 * This is the last of three independent guards — the MCP tool registry only
 * emits `list_*`/`get_*`, and the mint guard rejects `mcp:read` alongside any
 * write-granting scope. It exists so a client bug or a mis-scoped key still
 * cannot push a write through.
 *
 * Returns true when the request was refused (403 already sent).
 */
export async function refuseIfMcpWrite(
  request: FastifyRequest,
  reply: FastifyReply,
  scopes: readonly string[],
  principal: 'keys' | 'tokens',
): Promise<boolean> {
  if (!scopes.includes('mcp:read')) return false
  if (request.method === 'GET' || request.method === 'HEAD') return false
  await reply.status(403).send({
    error: {
      code: 'MCP_READ_ONLY',
      message: `mcp:read ${principal} may only issue GET requests; ${request.method} was rejected.`,
    },
  })
  return true
}

/**
 * The MCP client is only protected if its key says it is an MCP key.
 *
 * Every guard above keys off `mcp:read`, and each opens by returning false when
 * the scope is absent. So an agent driven by an ordinary API key gets none of
 * them: writes are not refused at the auth layer, the `features.mcp_enabled`
 * kill switch does not reach it, and it bills to the general key budget rather
 * than the MCP one. It works, silently, in the one mode an operator cannot see
 * or stop — which is worse than not working.
 *
 * Detected from the User-Agent `@opensteward/mcp-server` sends (see that
 * package's `rest-client.ts`) rather than a bespoke opt-in header, so every
 * client version is covered without coordination.
 *
 * A guard rail, not a boundary. Absent or rewritten User-Agent means no
 * enforcement, so a proxy cannot break a working deployment — `mcp:read`'s own
 * enforcement above remains the boundary. It refuses an honest mistake, and
 * makes no claim about a determined one.
 *
 * Returns true when the request was refused (403 already sent).
 */
export async function refuseIfMcpClientLacksScope(
  request: FastifyRequest,
  reply: FastifyReply,
  scopes: readonly string[],
): Promise<boolean> {
  const raw = request.headers['user-agent']
  const ua = (Array.isArray(raw) ? raw[0] : raw) ?? ''
  if (!ua.startsWith(MCP_CLIENT_USER_AGENT)) return false
  if (scopes.includes('mcp:read')) return false
  await reply.status(403).send({
    error: {
      code: 'MCP_KEY_REQUIRED',
      message:
        'This key lacks the mcp:read scope, so the MCP read-only guard, the ' +
        'features.mcp_enabled kill switch and the MCP rate-limit budget do not ' +
        "apply to it. Mint a key at /api-keys with 'MCP agent (read-only)' " +
        'ticked, or add mcp:read to this one.',
    },
  })
  return true
}
