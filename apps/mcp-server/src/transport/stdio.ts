/**
 * stdio transport — serves the tool registry over stdin/stdout. This is what
 * desktop AI agents (Claude Desktop, Cursor, Continue, Cline, gemini-cli) use.
 *
 * The agent owns the process lifecycle: it spawns us, pipes JSON-RPC, and
 * reaps us on exit.
 *
 * Built on `serveStdio` from `@modelcontextprotocol/server` v2, which serves
 * MCP 2026-07-28. That revision retires the `initialize`/`initialized`
 * handshake in favour of a stateless core where each request carries its own
 * protocol version and client identity in `_meta`.
 *
 * We deliberately keep the default `legacy: 'serve'`. Most shipped agents
 * still open with a 2025-era `initialize`, and under this setting such a
 * connection is pinned to a 2025-era instance from the same factory while
 * modern clients get 2026-07-28 — the tools below are registered once and
 * serve both eras. Switching to `legacy: 'reject'` would refuse every agent
 * that has not upgraded yet.
 *
 * The factory runs per connection, so nothing here may hold cross-connection
 * state.
 */
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio'
import type { McpTool } from '../tool-registry.js'

export interface StdioServerOptions {
  /** Server name shown to the client. */
  name: string
  /** Server version (matches package.json). */
  version: string
  /** Built tool list. */
  tools: McpTool[]
}

/**
 * Starts serving on the process's stdio. Returns synchronously — unlike the
 * v1 `server.connect(transport)` flow this does not need awaiting; the
 * returned handle's `close()` tears the connection down.
 */
export function startStdioServer(opts: StdioServerOptions): StdioServerHandle {
  return serveStdio(() => {
    const server = new McpServer(
      { name: opts.name, version: opts.version },
      { capabilities: { tools: {} } },
    )

    for (const tool of opts.tools) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.schema },
        async (args: Record<string, unknown>) => {
          try {
            const text = await tool.call(args ?? {})
            return { content: [{ type: 'text' as const, text }] }
          } catch (err) {
            // Surface adapter/REST failures to the agent as tool errors rather
            // than transport errors, so it can retry or pick another tool.
            const msg = err instanceof Error ? err.message : String(err)
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `Tool '${tool.name}' failed: ${msg}` }],
            }
          }
        },
      )
    }

    // No unknown-tool branch: registerTool owns dispatch in v2 and answers an
    // unregistered name itself, where the v1 low-level handler had to.
    return server
  })
}
