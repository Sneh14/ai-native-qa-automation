# Test Strategy: Event Limits

**Feature**: Event Limits (FIFO Pruning, Static Event Immutability, Sandbox Warning Banners)
**Input**: `docs/scenarios/event-limits.md` (45 scenarios)
**Generated**: 2026-06-18
**Analyst**: Test Strategist Agent

---

## Distribution Table

| Layer     | Count | Focus                                                        | Avg Time  | Files                                    |
|-----------|-------|--------------------------------------------------------------|-----------|------------------------------------------|
| Unit      | 3     | Pure functions — pagination calc, date conversion, client validation | <10ms | `tests/unit/event-limits.unit.test.js`   |
| API       | 31    | Business rules, validation contracts, security, FIFO logic   | ~200ms    | `tests/api/event-limits.api.test.js`     |
| Component | 4     | Conditional rendering, UI state props (no runner yet — note below) | ~50ms | `tests/components/` (not yet configured) |
| E2E       | 12    | Full-stack flows, optimistic UI, multi-page journeys          | ~10–90s   | `tests/event-limits.spec.js` ✓ written   |
| **Total** | **50**| Pyramid: wide at bottom, narrow at top                       |           |                                          |

> **Note**: Component tests require a component test runner (e.g., Vitest + React Testing Library) which is not currently configured. Tests assigned to that layer are documented here as future work; the E2E layer carries that coverage in the interim.

---

## Test Pyramid Shape

```
        /‾‾‾‾‾‾‾‾‾\
       /    E2E     \   12 tests — full journeys only
      /‾‾‾‾‾‾‾‾‾‾‾‾‾\
     / Component (4) \  4 tests — UI conditionals (future)
    /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
   /      API (31)      \  31 tests — business rules + contracts
  /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
 /       Unit (3)         \  3 tests — pure functions
/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
```

---

## Unit Layer (3 tests)

These are pure functions with no I/O, extracted from source code analysis. Not represented as numbered scenarios in the scenarios doc — they emerge from code inspection.

| Test ID   | Function                          | Source File                          | Reason for Unit Layer                                |
|-----------|-----------------------------------|--------------------------------------|------------------------------------------------------|
| UNIT-001  | `buildPages(current, total)`      | `frontend/components/ui/Pagination.jsx:4`  | Pure math — input → output array, zero dependencies |
| UNIT-002  | `toLocalDT(iso)`                  | `frontend/components/events/EventForm.jsx:24` | Pure date conversion — ISO → datetime-local string  |
| UNIT-003  | `validate()` (EventForm)          | `frontend/components/events/EventForm.jsx:63` | Pure object → errors map, no DOM or API calls        |

**UNIT-001 rationale**: `buildPages` computes page-number arrays with ellipsis logic (e.g., `[1, '…', 4, 5, 6, '…', 10]`). It has 8+ distinct input space regions (first page, last page, middle pages, small total) — ideal unit test coverage. Any regression here silently breaks pagination across the entire app.

**UNIT-002 rationale**: `toLocalDT` adjusts for timezone offset. A bug here would cause the edit form to pre-populate the date 30 minutes off in IST. Pure function — no reason to exercise this through E2E.

**UNIT-003 rationale**: Client-side validation in `validate()` is duplicated from the server validator. Both must agree. Testing the client logic as a unit catches divergence before it reaches E2E tests. Covers: empty title, past date (`new Date(form.eventDate) <= new Date()`), negative price, zero seats.

---

## API Layer (31 tests)

All tests hit `http://localhost:3001/api/events` directly with a Bearer token. No browser required.

### Happy Path API Contracts

| TC     | Endpoint              | Assert                                                            | Source                                       |
|--------|-----------------------|-------------------------------------------------------------------|----------------------------------------------|
| TC-006 | `POST /api/events`    | HTTP 201, `availableSeats === totalSeats`, `isStatic: false`      | `eventController.js:22`, `eventService.js:48`|
| TC-007 | `GET /api/events`     | Returns static events + caller's dynamic events only              | `eventRepository.js:8` — ownership clause    |
| TC-110 | `POST /api/events`    | `data.availableSeats === data.totalSeats` in response body        | `eventService.js:65` — `availableSeats: parseInt(data.totalSeats)` |

### FIFO Pruning — Business Rules

| TC     | Operation                                       | Assert                                                       | Source                                                          |
|--------|-------------------------------------------------|--------------------------------------------------------------|-----------------------------------------------------------------|
| TC-101 | POST 7th event (user has 6)                     | Oldest by `createdAt` is deleted; E2–E7 survive              | `eventRepository.js:88` — `orderBy: { createdAt: 'asc' }`      |
| TC-102 | POST 6th dynamic event (10 static already exist)| Static events untouched; count for limit = dynamic only      | `eventRepository.js:83` — `countUserDynamic`: `{ isStatic: false }` |
| TC-109 | POST 7th event via API only (no UI)             | HTTP 201 for new event; `GET /api/events/:oldestId` → 404    | `eventService.js:50–53` — FIFO is entirely server-side         |
| TC-401 | POST E7, then immediately POST E8               | E1 pruned on E7, E2 pruned on E8; final = E3–E8              | `eventRepository.js:88–93` — `findOldestUserDynamic` re-queries each time |

**TC-401 note**: Rapid sequential creation is safe because `findOldestUserDynamic` queries the DB fresh on each call. After E7 deletes E1, E2 becomes the new oldest and is correctly deleted by E8. This is a concurrency-correctness test best expressed at the API layer.

### Static Event Immutability

| TC     | Endpoint                         | Assert                          | Source                                             |
|--------|----------------------------------|---------------------------------|----------------------------------------------------|
| TC-104 | `DELETE /api/events/:staticId`   | HTTP 403, `"Cannot delete a static event"` | `eventService.js:96`              |
| TC-105 | `PUT /api/events/:userAEventId`  | HTTP 403, `"You do not own this event"` (User B) | `eventService.js:77`          |
| TC-106 | `DELETE /api/events/:userAEventId`| HTTP 403, `"You do not own this event"` (User B) | `eventService.js:97`         |

### Security — Auth Enforcement

| TC     | Endpoint                     | Condition                  | Assert           | Source                                    |
|--------|------------------------------|----------------------------|------------------|-------------------------------------------|
| TC-200 | `POST /api/events`           | No Authorization header    | HTTP 401         | `eventRoutes.js:8` — `router.use(authMiddleware)` |
| TC-201 | `GET /api/events`            | No Authorization header    | HTTP 401         | Same                                      |
| TC-202 | `DELETE /api/events/:id`     | No Authorization header    | HTTP 401         | Same                                      |
| TC-203 | `GET /api/events/:id`        | User B fetches User A's event | HTTP 404 (hidden, not 403) | `eventRepository.js:46` — ownership WHERE clause |
| TC-204 | `GET /api/events`            | Expired JWT                | HTTP 401         | authMiddleware JWT verify                 |
| TC-205 | `POST /api/events`           | Tampered JWT payload       | HTTP 401         | authMiddleware signature check            |
| TC-206 | User B POSTs 7 events        | User A has 6 events        | User A's events untouched | `eventService.js:50` — `countUserDynamic(userId)` scoped |

**TC-203 rationale**: Cross-user dynamic event returns 404, not 403. This is by design — the repository WHERE clause `OR: [{ isStatic: true }, { userId }]` means non-owned dynamic events are invisible, so the lookup genuinely finds nothing. Testing this at API confirms the security model is enforced at the data layer, not just the service layer.

### Input Validation

| TC     | Invalid Input                  | Field       | Expected HTTP | Error Message                         | Source                              |
|--------|--------------------------------|-------------|---------------|---------------------------------------|-------------------------------------|
| TC-300 | Missing `title`                | title       | 400           | "Title is required"                   | `eventValidator.js:17`              |
| TC-301 | `eventDate` = yesterday        | eventDate   | 400           | "Event date must be in the future"    | `eventValidator.js:40–44`           |
| TC-302 | `price: -1`                    | price       | 400           | "Price must be a non-negative number" | `eventValidator.js:47–49`           |
| TC-303 | `totalSeats: 0`                | totalSeats  | 400           | "Total seats must be a positive integer" | `eventValidator.js:51–53`        |
| TC-304 | `imageUrl: "not-a-url"`        | imageUrl    | 400           | "Image URL must be a valid URL"       | `eventValidator.js:55–57`          |
| TC-305 | `GET /api/events/999999`       | —           | 404           | "Event with id 999999 not found"      | `eventService.js:43`               |
| TC-306 | `DELETE /api/events/999999`    | —           | 404           | "Event with id 999999 not found"      | `eventService.js:94`               |
| TC-307 | `eventDate: "25-12-2026"`      | eventDate   | 400           | "Event date must be a valid ISO 8601 date" | `eventValidator.js:39`        |
| TC-308 | `totalSeats: 50.5`             | totalSeats  | 400           | "Total seats must be a positive integer" | `eventValidator.js:51`          |

### Edge Cases — Boundary Values

| TC     | Input                         | Assert                                              | Source                                      |
|--------|-------------------------------|-----------------------------------------------------|---------------------------------------------|
| TC-402 | `price: 0`                    | HTTP 201 — free events are valid                    | `eventValidator.js:48` — `min: 0` not `min: 1` |
| TC-403 | `totalSeats: 1`               | HTTP 201, `availableSeats: 1`                       | `eventValidator.js:52` — `min: 1` is valid  |
| TC-408 | No `description` field        | HTTP 201, `description: ""`                         | `eventService.js:57` — `data.description \|\| ''` |
| TC-409 | No `imageUrl` field           | HTTP 201, `imageUrl: null`                          | `eventService.js:63` — `data.imageUrl \|\| null` |
| TC-410 | `eventDate = new Date().toISOString()` | HTTP 400 — present moment is rejected    | `eventValidator.js:41` — `<= new Date()` (not `<`) |

**TC-410 note**: The validator uses `<=`, meaning exactly "now" is invalid. This is a precision boundary: a timestamp 1ms in the future would pass. Worth an explicit API test to confirm the `<=` semantics are enforced.

---

## Component Layer (4 tests — future work)

These scenarios test pure rendering logic — conditional JSX based on props or state. They require zero network calls and run in milliseconds. Currently carried by E2E with route mocking; should be migrated to a component runner when Vitest + RTL is added.

| Scenario | Component                          | Props/State to Mock                        | What to Assert                              |
|----------|------------------------------------|--------------------------------------------|---------------------------------------------|
| TC-405   | `EventsContent` (`events/page.tsx:75`) | Mock `events` array length = 5        | Banner NOT rendered                         |
| TC-406   | `EventsContent` (`events/page.tsx:75`) | Mock `events` array length = 6        | Banner IS rendered                          |
| TC-500   | `AdminEventsPage` (`admin/events/page.tsx:93`) | `isLoading: true`            | Spinner rendered, table absent              |
| TC-503   | `AdminEventsPage` table row          | `event.availableSeats = 0 / 5 / 50`   | CSS class is `text-red-600 / amber / emerald`|

**Decision rationale**: All four depend only on a single prop value or array length. Testing through E2E requires creating real data or intercepting API routes — 10× slower for logic that lives entirely in JSX conditionals (`{events.length > 5 && <banner />}`). These are ideal component test candidates.

---

## E2E Layer (12 tests)

Only scenarios that require browser rendering, multi-page navigation, or full-stack verification belong here. All are implemented in `tests/event-limits.spec.js`.

| TC     | Title                                                         | Why E2E (not lower)                                              | Status     |
|--------|---------------------------------------------------------------|------------------------------------------------------------------|------------|
| TC-001 | Create event via admin form → appears in table               | Verifies form submit → React Query cache update → table rerender | ✓ Written  |
| TC-003 | Edit event → form switches to edit mode, change persisted     | Covers `selectedEvent` state, `useEffect` pre-fill, toast        | ✓ Written  |
| TC-004 | Delete event → optimistic removal from table                  | Optimistic cache mutation is frontend-only, invisible to API     | ✓ Written  |
| TC-005 | Delete event → associated booking cascades                    | Multi-page journey: admin → delete → bookings list               | ✓ Written  |
| TC-100 | 7th event prunes oldest (FIFO) — browser validation           | Defense-in-depth: API layer (TC-109) tests the rule; E2E tests the full UX including search verification | ✓ Written + **PASSED** |
| TC-103 | Static events show "Read-only", no Edit/Delete buttons        | UI-only enforcement — API covers the 403; E2E covers the button absence | ✓ Written  |
| TC-108 | Admin page always shows "6 events" sandbox warning            | Static JSX — renders regardless of state; smoke check           | ✓ Written  |
| TC-400 | 6th event creation does NOT prune (boundary)                  | Defense-in-depth: confirms the `>= 6` boundary UX works end-to-end | ✓ Written  |
| TC-502 | Static events show "Featured" badge                           | Conditional badge rendered by `event.isStatic` branch in JSX    | ✓ Written  |
| TC-503 | Seat count color coding (green/amber)                         | CSS class applied by ternary on `availableSeats`                 | ✓ Written  |
| TC-504 | Edit form pre-populates with existing event data              | Verifies `useEffect([event])` and `toLocalDT()` work together   | ✓ Written  |
| TC-505 | Delete confirm dialog: content correct, Cancel preserves event| Dialog open/close state, `setDeletingId(null)` on cancel        | ✓ Written  |

### Intentionally excluded from E2E

| TC     | Original Suggestion | Reassigned To | Reason                                                        |
|--------|---------------------|---------------|---------------------------------------------------------------|
| TC-002 | E2E                 | API (TC-109)  | Pure count check after 6 POSTs — no UI behavior beyond toast; TC-109 covers this faster |
| TC-309 | E2E                 | E2E ✓         | React Query cache rollback — truly frontend-only; keep        |
| TC-404 | E2E                 | E2E (not written yet) | Double-delete via UI with route interception needed  |
| TC-407 | E2E                 | Redundant      | Covered by TC-400 (boundary) + TC-100 (FIFO) together        |
| TC-501 | E2E                 | Component (future) | Empty state = pure `events.length === 0` prop condition  |
| TC-506 | E2E                 | Partially E2E  | Pagination presence covered by 10 static events existing — low value standalone test |
| TC-507 | E2E                 | Covered        | Duplicate of TC-405/406 threshold tests                       |
| TC-508 | E2E                 | Already covered | `event-browsing.spec.js` TC-303/304 cover error state + retry |
| TC-509 | E2E                 | Low priority   | Counter is derived from `pagination.total` — API layer verifies the count is correct |

---

## Defense-in-Depth Map

P0 rules that are tested at **two or more layers** for maximum confidence:

| Business Rule                          | Unit | API           | E2E           |
|----------------------------------------|------|---------------|---------------|
| Max 6 dynamic events per user          | —    | TC-101, TC-102, TC-109 | TC-100, TC-400 |
| Oldest event pruned first (FIFO)       | —    | TC-101, TC-401 | TC-100       |
| Static events cannot be modified       | —    | TC-104, TC-105, TC-106 | TC-103     |
| Authentication required for all routes | —    | TC-200, TC-201, TC-202 | Covered by login guard in all E2E |
| `availableSeats` initialised to `totalSeats` | UNIT-003 (validate) | TC-110 | TC-001 (toast + table shows 50/50) |

---

## Anti-Patterns Found

### In `docs/scenarios/event-limits.md`

| Anti-Pattern | Affected Scenarios | Recommendation |
|--------------|--------------------|----------------|
| **Validation tests assigned to E2E** | TC-300–308 were suggested as API (correct in this case ✓) — no issue here | Already correctly placed at API layer |
| **State-dependent UI tests as E2E** | TC-405/406 (banner threshold at 5/6 events) suggested as E2E | These depend on a single array length — move to Component when runner is added |
| **Duplicate coverage** | TC-407 duplicates TC-100 + TC-400 end-to-end | Remove TC-407 or downgrade to API-only |
| **Redundant E2E for single-prop rendering** | TC-500 (loading spinner), TC-501 (empty state), TC-503 (color) suggested E2E | These are pure prop→class/render scenarios — Component layer is correct |

### In `tests/event-limits.spec.js` (written tests)

| Finding | Location | Issue |
|---------|----------|-------|
| No anti-patterns found | — | Follows best practices: self-contained, unique titles via `Date.now()`, no `waitForTimeout`, proper locator priority |
| TC-503 tests green and amber only | `event-limits.spec.js:342` | Red (0 seats) not covered — acceptable P2 gap; requires booking step |

---

## Implementation Priority

```
Phase 1 — DONE (event-limits.spec.js, TC-100 PASSING)
  ✅ 12 E2E tests written and runnable

Phase 2 — Next: API tests
  → Create tests/api/event-limits.api.test.js
  → Priority order: TC-109, TC-101, TC-102 (FIFO) → TC-104–106 (static) → TC-200–206 (security) → TC-300–310 (validation) → TC-402, 403, 410 (edge)

Phase 3 — Future: Unit tests
  → Add Vitest; test buildPages(), toLocalDT(), validate()

Phase 4 — Future: Component tests
  → Add Vitest + RTL; migrate TC-405, TC-406, TC-500, TC-503
```
