# Changelog

All notable changes to Ledgerity are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-11-28

### Added
- Rename a projection or change its start and end dates with the pencil button next to its name. Items that fall outside a narrower range are only hidden. They come back if you widen the range again.

## [1.1.0] - 2026-11-28

### Added
- New **Custom** option under "How often" for projection items and recurring expense parts. Pick the exact days on a calendar, across as many months as you like. Days you picked in other months are kept while you browse. A short summary under the calendar shows how many dates you picked and which ones, grouped by month. Busy months show a count, and long lists fold behind "Show all". Click a month in the summary to jump to it.
- On projections, the Custom calendar only lets you pick days inside the projection's date range.

### Changed
- Removed "Every 2 weeks" from the "How often" choices. Use **Weekly** with "Repeat every 2 weeks" instead; it gives the same dates.
- Custom dates are used exactly as picked, so the Weekend Adjustment setting is hidden for them.

### Upgrading
- Items that already repeat every 2 weeks keep working with the same dates. They show up as Weekly, repeating every 2 weeks, the next time you edit them. Importing an older JSON export that uses "every 2 weeks" converts those items the same way.
- Installment plans still offer "Every 2 weeks" as a payment schedule. That setting is separate and hasn't changed.
- JSON exports that include Custom items can't be imported into versions older than 1.1.0.

## [1.0.0] - 2026-11-24

First public release.

### Expenses
- One page per expense, with parts that are paid in full, paid by installment, recurring, flexible (pay any amount), or planned (wishlist).
- Installment plans can cover several parts at once. Down payments, interest (fixed amount, monthly add-on rate, or derived from the monthly payment), fees and late charges all count toward the true total.
- Each part shows its share of interest, and the expense shows its cost of financing.
- Due schedules show overdue alerts. Payments can be logged per installment, charge or recurring occurrence.
- Paid so far, remaining, planned and true totals are shown with charts, and expenses can be archived.
- A "Can I afford it?" check tests a planned purchase against a projection.

### Funds projection
- Recurring income and bills (weekly, semi-monthly, monthly, yearly, …), with weekend paydays moved to the next business day.
- Grouped by cutoff period (default: the 10th and 25th) or shown as one continuous ledger.
- Plan vs. actual: mark items done, record the actual amount, and set balance checkpoints.
- Dues from Expenses appear automatically. Each can be excluded per projection, and overdue dues are carried into the projection.
- One pooled balance. A projection's starting balance is a list of named sources (one lump sum, or several such as bank and cash on hand) that add up to the total, editable from the projection page. Use your banking or budgeting app to track individual accounts.
- Balance checkpoints set the actual total balance.
- Scenarios: duplicate a projection, change it, and compare up to three side by side.

### App
- A dashboard with a "Projected Balance Today" card (from the baseline projection), next payday, upcoming and overdue dues, a calendar and recent payments.
- Data is stored locally in SQLite. A backup is made automatically each day, plus a safety backup before any restore, import, reset or erase.
- JSON export/import and CSV export.
- Light, dark and system themes, and a responsive layout for phones.
- Optional phone access over the local network (off by default).
- A first-run welcome screen to start fresh or explore demo data.

### Upgrading from pre-release builds
- Databases from builds that had accounts are migrated automatically (schema version 3). Per-account start balances become sources named after their account, and transfers are removed. JSON exports from those builds can't be imported; restore an SQLite backup instead.
