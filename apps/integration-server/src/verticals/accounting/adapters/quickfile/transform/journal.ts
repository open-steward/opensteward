// QuickFile does not expose a journal / general ledger posting endpoint
// that maps cleanly to the canonical Journal resource.
// The Ledger_Search endpoint queries by nominal code and date range but
// returns ledger entries rather than full journal vouchers.
// This file is intentionally minimal; the adapter does not implement listJournals.
export {}
