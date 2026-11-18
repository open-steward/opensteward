/**
 * Mint a tenant-scoped developer API key.
 *
 * Usage:
 *   pnpm --filter integration-server tsx scripts/mint-api-key.ts \
 *     --tenant <tenantId> [--label "<label>"] [--test]
 *
 * The plaintext key is printed exactly once. Save it — it cannot be
 * recovered after this command exits.
 */
import { ApiKeyStore, openDb, type ApiKeyMode } from '@opensteward/shared'
import { loadConfig } from '../src/config'

interface Args {
  tenant?: string
  label?: string
  list?: boolean
  revoke?: string
  mode?: ApiKeyMode
}

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tenant') out.tenant = argv[++i]
    else if (a === '--label') out.label = argv[++i]
    else if (a === '--test') out.mode = 'test'
    else if (a === '--live') out.mode = 'live'
    else if (a === '--list') out.list = true
    else if (a === '--revoke') out.revoke = argv[++i]
    else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return out
}

function printHelp(): void {
  console.log(`Usage:
  --tenant <id>           tenantId to mint a key for (required for mint)
  --label "<label>"       optional label for the key
  --test                  mint a sandbox key for /test/v1/* (default: live)
  --live                  mint a live key for /v1/* (the default)
  --list [--tenant <id>]  list existing keys (optionally filtered by tenant)
                          add --test / --live to filter by mode
  --revoke <id>           revoke the key with the given id`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  const handle = await openDb({
    databaseUrl: config.credDb.databaseUrl,
    sqlitePath: config.credDb.sqlitePath,
    poolMax: config.credDb.poolMax,
  })
  const store = await ApiKeyStore.create(handle, config.storeSecret)

  if (args.list) {
    const rows = await store.list(args.tenant, args.mode ? { mode: args.mode } : undefined)
    if (rows.length === 0) {
      console.log(args.tenant ? `No keys for tenant '${args.tenant}'.` : 'No keys.')
      return
    }
    for (const r of rows) {
      const status = r.revokedAt ? 'revoked' : 'active'
      const last = r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : 'never'
      console.log(
        `${r.id}  tenant=${r.tenantId}  mode=${r.mode}  prefix=${r.prefix}…  status=${status}  last_used=${last}  label=${r.label ?? '-'}`,
      )
    }
    return
  }

  if (args.revoke) {
    const ok = await store.revoke(args.revoke)
    console.log(ok ? `Revoked ${args.revoke}` : `No active key with id ${args.revoke}`)
    process.exit(ok ? 0 : 1)
  }

  if (!args.tenant) {
    printHelp()
    process.exit(1)
  }

  const result = await store.mint({
    tenantId: args.tenant,
    label: args.label ?? null,
    mode: args.mode,
  })
  console.log('\nAPI key minted. Save the plaintext below — it will not be shown again.\n')
  console.log(`  id:      ${result.id}`)
  console.log(`  tenant:  ${result.tenantId}`)
  console.log(`  mode:    ${result.mode}`)
  console.log(`  label:   ${result.label ?? '-'}`)
  console.log(`  key:     ${result.plaintext}`)
  console.log(`  base:    ${result.mode === 'test' ? '/test/v1' : '/v1'}`)
  console.log()
}

main().catch((err) => {
  console.error('mint-api-key failed:', err)
  process.exit(1)
})
