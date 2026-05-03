"""Referral system service package — F-4b.

Submodules:
  - policy   — constants (rates, window, code regex/reserved words)
  - codes    — code validation, set, lookup
  - binding  — bind referee → referrer, walk chain, cycle prevention
  - payout   — compute & apply L1/L2 revshare payouts on perf_fee events
  - repo     — DB CRUD helpers shared across the above
"""
