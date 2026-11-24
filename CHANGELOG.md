# Changelog

All notable changes to Ledgerity are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- A projection's starting balance is now a list of named sources (one lump sum, or several such as bank and cash on hand) that add up to the total. Sources can be edited from the projection page.
- Balance checkpoints set the actual total balance.
- The dashboard's balance card is now "Projected Balance Today", taken from the baseline projection.

### Removed
- Accounts: the Accounts page, account pickers, per-account balances and chart lines, transfers, and the default-account setting. Ledgerity tracks one pooled balance; use your banking or budgeting app to track individual accounts.
- The `Account` and `ToAccount` columns in CSV exports.

### Upgrading
- Databases are migrated automatically (schema version 3). Existing per-account start balances become sources named after their account, and existing transfers are removed. JSON exports made before this change can't be imported; restore an SQLite backup instead.

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
- Multiple accounts with transfers. With only one account, the app works as a single pool.
- Scenarios: duplicate a projection, change it, and compare up to three side by side.

### App
- A dashboard with balances, next payday, upcoming and overdue dues, a calendar and recent payments.
- Data is stored locally in SQLite. A backup is made automatically each day, plus a safety backup before any restore, import, reset or erase.
- JSON export/import and CSV export.
- Light, dark and system themes, and a responsive layout for phones.
- Optional phone access over the local network (off by default).
- A first-run welcome screen to start fresh or explore demo data.
