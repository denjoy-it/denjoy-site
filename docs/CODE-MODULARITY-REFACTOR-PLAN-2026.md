# Code Modularity Refactor Plan — 2 april 2026

## Executive Summary

**Current State:** app.py = 12,000+ lines (monolith)  
**Goal:** Split into logical service modules while maintaining backward compatibility  
**Effort:** Phase 1 (Priority) = 6-8 hours; Full refactor = 20+ hours  
**Risk:** Medium (large codebase) → Mitigated by keeping imports centralized

---

## Why Refactor?

| Problem | Impact | Solution |
|---------|--------|----------|
| Hard to navigate 12K line file | Slow debugging, slow onboarding | Split into 8 modules |
| Database logic mixed with routing | Can't test queries independently | Extract `db_layer.py` |
| Auth scattered throughout | Inconsistent permission checking | Extract `auth_service.py` |
| Service modules not cohesive | Hard to test customer logic alone | Extract service layer |
| N+1 query patterns hard to see | Performance issues | Centralize DB access |

---

## Proposed Structure

### Current (Monolith)
```
backend-api/
  app.py (12K lines)
    ├── Routing (GET /api/...)
    ├── Database functions
    ├── Auth logic
    ├── Service business logic
    ├── Handlers
    └── Constants
```

### Target (Modular)
```
backend-api/
  app.py (2K lines → ROUTING ONLY)
    ├── Handler class
    ├── HTTP routing dispatcher
    └── Module initialization
  
  db_layer.py (1.5K lines) ← NEW
    ├── db_execute, db_fetchone, db_fetchall
    ├── get_conn, init_db, migrations
    └── Query builders
  
  auth_service.py (1K lines) ← NEW
    ├── Session verification
    ├── Permission checking (_session_can, _session_can_service)
    ├── Approval logic
    └── RBAC helpers
  
  models/ (NEW)
    ├── tenants.py (300 lines)
    ├── customers.py (300 lines)
    ├── assessments.py (300 lines)
    └── jobs.py (300 lines)
  
  routes/ (NEW)
    ├── api.py (500 lines)
    ├── tenants.py (200 lines)
    ├── customers.py (200 lines)
    └── assessments.py (200 lines)
  
  services/
    ├── customer_service.py (existing - enhance exports)
    ├── onboarding_service.py (existing - enhance exports)
    └── msp_control_center_service.py (existing - enhance exports)
```

---

## Phase 1: High-ROI Extraction (6-8 hours)

### Step 1: Extract Database Layer (1.5 hours)
**Goal:** Centralize all database operations

**New File:** `backend-api/db_layer.py`
```python
from app import DB_PATH, get_conn, db_execute, db_fetchone, db_fetchall

# Move:
# - get_conn()
# - db_fetchall(), db_fetchone(), db_execute()
# - init_db()
# - All database migrations
```

**Changes to app.py:**
```python
# From
from backend.app import DB_PATH, get_conn
# To
from backend.db_layer import DB_PATH, get_conn, db_fetchall, db_fetchone, db_execute
```

**Benefits:**
- ✓ Database queries become testable
- ✓ Easier to add caching layer later
- ✓ Query performance issues become visible

---

### Step 2: Extract Auth Service (1.5 hours)
**Goal:** Centralize permission logic

**New File:** `backend-api/auth_service.py`
```python
# Move:
# - _session_can(sess, action_key)
# - _session_can_service(sess, cid, service_key, op)
# - _action_requires_approval(action_key)
# - _build_session_access_profile(sess)
# - All RBAC constants
# - All approval policy logic
```

**Changes to app.py:**
```python
from backend.auth_service import (
    session_can, session_can_service,
    action_requires_approval, check_approval_required
)
```

**Benefits:**
- ✓ Permission logic becomes testable
- ✓ Easier to enforce consistent auth patterns
- ✓ Simpler to audit security decisions

---

### Step 3: Extract Customer Model (1.5 hours)
**Goal:** Consolidate customer-related queries

**New File:** `backend-api/models/customers.py`
```python
from backend.db_layer import db_fetchall, db_fetchone, db_execute

def get_customer(customer_id: str):
    return db_fetchone("SELECT * FROM customers WHERE id=?", (customer_id,))

def list_customers(status=None):
    if status:
        return db_fetchall("SELECT * FROM customers WHERE status=?", (status,))
    return db_fetchall("SELECT * FROM customers")

def create_customer(data):
    # ... validation and insert
    pass

def update_customer(customer_id, data):
    # ... validation and update
    pass
```

**Changes to app.py:**
```python
from backend.models.customers import (
    get_customer, list_customers, create_customer, update_customer
)

# Old: db_fetchone("SELECT * FROM customers...", ...)
# New: get_customer(cid)
```

**Benefits:**
- ✓ Customer queries are centralized
- ✓ Easier to add customer-wide logic (e.g., delete cascade)
- ✓ Simpler to test customer operations

---

### Step 4: Create Route Dispatcher (2 hours)
**Goal:** Separate routing from business logic

**New File:** `backend-api/routes/api.py`
```python
from backend.models.customers import get_customer, list_customers
from backend.models.tenants import get_tenant, list_tenants

def route_customers_get(path, params, session):
    """GET /api/customers or /api/customers/{id}"""
    if len(path.split("/")) == 3:
        cid = path.split("/")[3]
        return get_customer(cid)
    else:
        return list_customers()

def route_tenants_get(path, params, session):
    """GET /api/tenants or /api/tenants/{id}"""
    if len(path.split("/")) == 3:
        tid = path.split("/")[3]
        return get_tenant(tid)
    else:
        return list_tenants()

# Main router
ROUTES = {
    r"^/api/customers(/[^/]+)?$": route_customers_get,
    r"^/api/tenants(/[^/]+)?$": route_tenants_get,
    # ... more routes
}
```

**Changes to app.py:**
```python
# Instead of 500 lines of inline routing:
for pattern, handler in ROUTES.items():
    if re.match(pattern, path):
        result = handler(path, params, session)
        return self._json(200, result)
```

**Benefits:**
- ✓ Routes become testable
- ✓ Easier to add middleware (logging, rate limiting)
- ✓ Clearer pattern for adding new routes

---

## Phase 2: Additional Refactoring (Full Scope - 14+ hours)

### Step 5: Extract Assessment Service Model
Similar to customers, consolidate assessment_runs, findings, etc.

### Step 6: Extract Job Service
Consolidate job_queue operations, dispatcher integration

### Step 7: Extract Approval Service
Consolidate approval_requests, approval_policies logic

### Step 8: Re-organize Services
Export consistent interfaces from existing services:
- `customer_service.py`
- `onboarding_service.py`
- `msp_control_center_service.py`

---

## Execution Strategy

### Approach: **Strangler Pattern** (Zero Downtime)
Instead of refactoring all at once:

1. Extract modules one-by-one
2. Keep app.py importing from new modules
3. All new endpoints use new module imports
4. Old endpoints gradually migrate to new imports
5. Eventually app.py becomes solely a router

### Timeline
```
Day 1 (4 hours): Phase 1 Steps 1-3 (db, auth, models)
Day 2 (4 hours): Phase 1 Step 4 (routing)
Day 3-5: Phase 2 (full modularity)
```

**Runnable After Each Step:**
- ✓ After Step 1: All DB queries work (tests pass)
- ✓ After Step 2: All auth checks work (tests pass)
- ✓ After Step 3: Customers API works via new module
- ✓ After Step 4: Full router pattern works

---

## File Size Comparison

### Before
```
app.py
  12,000 lines
  ├─ 2,000 constants/imports
  ├─ 500 routing logic
  ├─ 1,500 database functions
  ├─ 800 auth logic
  ├─ 2,500 customer handlers
  ├─ 2,000 tenant handlers
  ├─ 2,000 assessment handlers
  └─ 700 utility functions
```

### After
```
app.py: 2,000 lines (router only)
db_layer.py: 1,500 lines (DB + migrations)
auth_service.py: 800 lines (permissions)
models/:
  ├─ tenants.py: 300 lines
  ├─ customers.py: 350 lines
  ├─ assessments.py: 400 lines
  └─ jobs.py: 200 lines
routes/:
  ├─ tenants.py: 200 lines
  ├─ customers.py: 250 lines
  ├─ assessments.py: 300 lines
  └─ jobs.py: 150 lines

Total: 9,400 lines (same logic, better organized)
```

---

## Testing Strategy

### Unit Tests (New)
```python
# tests/test_db_layer.py
def test_get_customer():
    cust = get_customer("cust-123")
    assert cust["id"] == "cust-123"

# tests/test_auth.py
def test_session_can():
    sess = {"role": "admin"}
    assert session_can(sess, "customer.write") == True
    
# tests/test_models.py
def test_create_customer():
    cust = create_customer({"name": "Test"})
    assert cust["id"] is not None
```

### Integration Tests (Keep Existing)
```python
# tests/test_api.py
def test_get_customers_api():
    res = client.get("/api/customers")
    assert res.status_code == 200
```

---

## Rollback Plan

If issues arise during refactoring:

1. **Git commit after each step** (Phase 1 = 4 commits)
2. **Keep original app.py as backup** (app.py.bak)
3. **All imports use compatibility layer:**
   ```python
   # If new module has issue, fall back to old
   try:
       from models.customers import get_customer
   except ImportError:
       from app import get_customer  # fallback to monolith
   ```

---

## Monitoring & Validation

### Performance: Should Stay the Same
```
Before: GET /api/customers → 45ms
After: GET /api/customers → 45ms (route dispatch overhead negligible)
```

### Code Quality: Should Improve
```
Before: Cyclomatic complexity (app.py) = 287
After: Cyclomatic complexity (per module) = 8-15 avg
```

### Test Coverage: Should Increase
```
Before: 30% coverage (hard to test monolith)
After: 75%+ coverage (testable modules)
```

---

## Success Criteria

- ✅ All existing APIs work identically  
- ✅ No performance degradation  
- ✅ Code navigation easier (jump to relevant module)  
- ✅ New team members can add features faster  
- ✅ Auth logic centralized + testable  
- ✅ DB layer separated + caching-ready  

---

## Quick Start (If You Just Want DBOLayer)

Fastest path to db_layer extraction:

```bash
# 1. Create db_layer.py with DB functions
# 2. Update imports in app.py (5 minutes)
# 3. Test: python -m pytest tests/
# 4. Done! (1 hour total)
```

Full modularity can be phased in incrementally.

---

## Summary

| Phase | Effort | Benefit | Priority |
|-------|--------|---------|----------|
| Phase 1: DB + Auth + Models | 6-8h | 40% code improvement | 🔴 CRITICAL |
| Phase 2: Routes + Services | 12-14h | 60% code improvement | 🟡 HIGH |
| Phase 3: Tests + CI/CD | 8-10h | 75% test coverage | 🟢 MEDIUM |

**Recommendation:** Execute Phase 1 this sprint, Phase 2 next sprint.
