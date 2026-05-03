"""Premium subscription service package — F-4c.

Renamed from "subscription" to avoid colliding with the existing
services/subscription.py (Tatum webhook subscription helper).

Submodules:
  - policy   — constants (plan price, grace period)
  - repo     — DB CRUD helpers
  - billing  — subscribe / cancel / uncancel / renew_due_subscriptions
"""
