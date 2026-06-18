import { runGrustWatchlistAuditCli } from '../../../../apps/garbage/scripts/grust-watchlist-audit.mjs'

await runGrustWatchlistAuditCli(process.argv.slice(2))
