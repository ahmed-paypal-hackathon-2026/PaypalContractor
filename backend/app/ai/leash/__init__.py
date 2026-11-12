"""Interface 3 — P2's Leash AI side (Rev 2.3 §7.5).

Three optional functions consumed by Leash through dynamic import:

- ``compile_leash_policy(text)`` — turn the owner's free-text rules into a
  ``LeashPolicy`` (router ``POST /leash/policy/compile``; 501 when absent).
- ``explain_decision(...)`` — short prose reason for a guard decision (R5:
  payroll Ask/Deny only; the invoice path stays template-only and < 5 ms).
- ``map_timesheet_columns(headers, samples)`` — advisory column mapping
  proposal; P5's heuristic ``guess_mapping`` remains the fallback.

Hard rule: AI never computes money or makes a decision. Compilation output is
validated against the canonical Leash schemas, unknown/unsafe parts are dropped,
and every path has a deterministic fallback. Owner prose and timesheet cells are
wrapped as passive ``<untrusted_input>`` data.
"""

from __future__ import annotations

from .compile import compile_leash_policy
from .explain import explain_decision
from .mapping import map_timesheet_columns

__all__ = ["compile_leash_policy", "explain_decision", "map_timesheet_columns"]
