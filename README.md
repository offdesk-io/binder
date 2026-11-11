# Ledger

Leads and clients for Offdesk. Sibling to Bench: same sign-in, same Tenon design system.
Design: `docs/superpowers/specs/2026-11-11-ledger-design.md`.

```
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
LEDGER_DB=ledger.db .venv/bin/python -m ledger     # http://127.0.0.1:8770
```

`LEDGER_AUTH=header` is the server behind nginx, and needs `LEDGER_DB` set to an absolute path; unset is local development. Ledger listens on loopback only in both modes. `LEDGER_TZ` (default `Europe/London`) decides what "today" means for the needs-attention feed.
