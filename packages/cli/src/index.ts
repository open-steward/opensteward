#!/usr/bin/env node
/**
 * `os` — the OpenSteward CLI entry point.
 *
 * Builds the commander program (lazy-loading every generated tag
 * module + the static offline-tool registrations) and dispatches.
 *
 * Almost all of the CLI's surface is generated from the two OpenAPI
 * specs in `docs/openapi/`. This file, `auth.ts`, `client.ts`, and
 * `offline-tools.ts` are the only hand-written runtime files in this
 * package; everything else falls out of a generator.
 */

import { buildProgram } from './dispatcher.js'

async function main(): Promise<void> {
  const program = await buildProgram()
  await program.parseAsync(process.argv)
}

main().catch((err: unknown) => {
  process.stderr.write(`os: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
})
