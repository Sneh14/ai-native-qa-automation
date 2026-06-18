# Test Scenarios: Event Limits

**Feature**: Event Limits (FIFO Pruning, Static Event Immutability, Sandbox Warning Banners)
**Generated**: 2026-06-18
**Source Rules**: business-rules.md §3, §5; eventService.js; eventRepository.js; admin/events/page.tsx; events/page.tsx

---

## Happy Path (TC-001–TC-099)

### TC-001: Create First Event Successfully
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User is logged in with 0 user-created events
**Steps**:
1. Navigate to `/admin/events`
2. Fill in all required fields (title, category, city, venue, future date, price ≥ 0, seats ≥ 1)
3. Submit the form
**Expected Results**:
- "Event created!" toast appears
- New event appears in the events table
- Event count increases to 1
- `availableSeats` equals `totalSeats` on creation
**Business Rule**: eventService.js `createEvent` — `availableSeats` is initialized to `totalSeats`
**Suggested Layer**: E2E

---

### TC-002: Create Up to 6 Events Without Pruning
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User is logged in with 0 user-created events
**Steps**:
1. Navigate to `/admin/events`
2. Create 6 events sequentially, each with unique titles
3. After each creation, verify the event appears in the table
**Expected Results**:
- All 6 events are created and visible in the table
- No automatic deletion occurs
- Event table shows 6 user-created events
**Business Rule**: Max 6 user-created events; FIFO pruning only triggers when count reaches 6 and a new one is added
**Suggested Layer**: E2E

---

### TC-003: Edit a User-Created Event
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User is logged in with at least 1 user-created event
**Steps**:
1. Navigate to `/admin/events`
2. Click "Edit" on a user-created event
3. Modify the title and save
**Expected Results**:
- Form populates with existing event data
- Updated title reflects in the table after save
- Success toast is shown
**Business Rule**: Only non-static events can be edited (eventService.js `updateEvent`)
**Suggested Layer**: E2E

---

### TC-004: Delete a User-Created Event
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User is logged in with at least 1 user-created event
**Steps**:
1. Navigate to `/admin/events`
2. Click "Delete" on a user-created event
3. Confirm in the dialog
**Expected Results**:
- Event is removed from the table immediately (optimistic UI)
- "Event deleted" success toast appears
- Event count decreases by 1
**Business Rule**: Deleting an event cascades to all associated bookings
**Suggested Layer**: E2E

---

### TC-005: Delete Event Cascades to Its Bookings
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User has a booking on one of their user-created events
**Steps**:
1. Note the booking ID on a user-created event
2. Navigate to `/admin/events` and delete that event
3. Navigate to `/bookings`
**Expected Results**:
- The booking associated with the deleted event no longer appears in the bookings list
**Business Rule**: Prisma cascade delete — `Booking` has FK to `Event` with cascade
**Suggested Layer**: E2E

---

### TC-006: Create Event via API Returns 201 with Created Event
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Valid JWT token available
**Steps**:
1. Send `POST /api/events` with all required fields and valid future date
**Expected Results**:
- HTTP 201 response
- Response body: `{ success: true, data: { id, title, availableSeats == totalSeats, isStatic: false, userId: <currentUser> }, message: "Event created successfully" }`
**Business Rule**: API layer — eventRoutes.js POST /
**Suggested Layer**: API

---

### TC-007: List Events Returns Static + User-Created Events
**Category**: Happy Path
**Priority**: P0
**Preconditions**: Seeded DB (10 static events); user has created 2 dynamic events
**Steps**:
1. Send `GET /api/events` (or navigate to `/events`)
**Expected Results**:
- Static events appear for the user
- User's 2 dynamic events appear
- Other users' dynamic events are NOT shown
**Business Rule**: eventRepository.js `findAll` — `OR: [{ isStatic: true }, { userId }]`
**Suggested Layer**: API

---

## Business Rules (TC-100–TC-199)

### TC-100: 7th Event Creation Prunes Oldest Event (FIFO)
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User has exactly 6 user-created events (note creation order)
**Steps**:
1. Record the title of the oldest (first-created) event
2. Navigate to `/admin/events`
3. Create a 7th event
**Expected Results**:
- 7th event is created successfully
- The OLDEST user-created event is automatically deleted
- The table now shows 6 events (5 remaining originals + new one)
- The deleted event is no longer accessible via API (`GET /api/events/:id` returns 404)
**Business Rule**: `MAX_USER_DYNAMIC_EVENTS = 6`; FIFO pruning on overflow (eventService.js `createEvent`)
**Suggested Layer**: E2E

---

### TC-101: FIFO Pruning Removes Only the Oldest — Not the Newest
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User has exactly 6 user-created events; events labeled E1 (oldest) through E6 (newest)
**Steps**:
1. Create a 7th event (E7)
2. Verify which event was pruned
**Expected Results**:
- E1 (oldest) is removed
- E2–E6 and E7 all remain
- The newly created E7 is accessible
**Business Rule**: `findOldestUserDynamic` orders by `createdAt: 'asc'` — the minimum `createdAt` is pruned
**Suggested Layer**: API

---

### TC-102: Static Events Are Not Counted Toward the 6-Event Limit
**Category**: Business Rule
**Priority**: P0
**Preconditions**: 10 static events seeded; user has 5 user-created events
**Steps**:
1. Create a 6th user-created event
2. Create a 7th user-created event
**Expected Results**:
- The 6th creation succeeds without pruning (limit not yet hit)
- The 7th creation triggers pruning of the oldest dynamic event
- Static events remain untouched throughout
**Business Rule**: `countUserDynamic` counts only `{ userId, isStatic: false }` events
**Suggested Layer**: API

---

### TC-103: Static Events Cannot Be Edited
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User is logged in; seeded static events are present
**Steps**:
1. Navigate to `/admin/events`
2. Observe the Actions column for a static (Featured) event
3. Attempt `PUT /api/events/:staticEventId` via API
**Expected Results**:
- UI: Static events show "Read-only" text instead of Edit/Delete buttons
- API: Returns HTTP 403 with error `"Cannot modify a static event"`
**Business Rule**: eventService.js `updateEvent` — `if (event.isStatic) throw new ForbiddenError`
**Suggested Layer**: E2E + API

---

### TC-104: Static Events Cannot Be Deleted
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User is logged in; seeded static events are present
**Steps**:
1. Attempt `DELETE /api/events/:staticEventId` via API
**Expected Results**:
- HTTP 403 with error `"Cannot delete a static event"`
- Static event remains in the database
**Business Rule**: eventService.js `deleteEvent` — `if (event.isStatic) throw new ForbiddenError`
**Suggested Layer**: API

---

### TC-105: User Cannot Edit Another User's Dynamic Event
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has created an event; logged in as User B
**Steps**:
1. As User B, send `PUT /api/events/:userAEventId` with valid data
**Expected Results**:
- HTTP 403 with error `"You do not own this event"`
- Event is not modified
**Business Rule**: eventService.js `updateEvent` — `if (event.userId !== userId) throw new ForbiddenError`
**Suggested Layer**: API

---

### TC-106: User Cannot Delete Another User's Dynamic Event
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has created an event; logged in as User B
**Steps**:
1. As User B, send `DELETE /api/events/:userAEventId`
**Expected Results**:
- HTTP 403 with error `"You do not own this event"`
- Event is not deleted
**Business Rule**: eventService.js `deleteEvent` — ownership check via `event.userId !== userId`
**Suggested Layer**: API

---

### TC-107: Sandbox Warning Banner Appears on Events Page When >5 Events Shown
**Category**: Business Rule
**Priority**: P1
**Preconditions**: The events list has more than 5 events (true by default with 10 seeded events)
**Steps**:
1. Log in and navigate to `/events`
**Expected Results**:
- Warning banner is visible containing "9 bookings" and "6 custom events" text
- Banner describes FIFO replacement behavior
**Business Rule**: events/page.tsx — banner rendered when `events.length > 5`
**Suggested Layer**: E2E

---

### TC-108: Sandbox Warning Banner on Admin Events Page Is Always Visible
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User is logged in
**Steps**:
1. Navigate to `/admin/events`
**Expected Results**:
- Amber info banner is always visible above the form: "You can add up to 6 events. Once the limit is reached, your oldest event is automatically replaced when you add a new one."
**Business Rule**: admin/events/page.tsx — static banner in JSX (no conditional)
**Suggested Layer**: E2E

---

### TC-109: FIFO Pruning Via API — No UI Involvement
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has exactly 6 dynamic events (created via API for speed)
**Steps**:
1. Record IDs of all 6 existing events (sorted by createdAt ascending — first is oldest)
2. Send `POST /api/events` to create a 7th event
3. Attempt `GET /api/events/:oldestId`
**Expected Results**:
- POST returns HTTP 201 (new event created)
- GET for oldest ID returns HTTP 404 (auto-pruned)
**Business Rule**: FIFO pruning is server-side logic, not UI-dependent
**Suggested Layer**: API

---

### TC-110: availableSeats Initialised to totalSeats on Create
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. `POST /api/events` with `totalSeats: 100`
**Expected Results**:
- Response contains `availableSeats: 100`
- No discrepancy between `totalSeats` and `availableSeats` at creation time
**Business Rule**: eventService.js `createEvent` — `availableSeats: parseInt(data.totalSeats, 10)`
**Suggested Layer**: API

---

## Security (TC-200–TC-299)

### TC-200: Unauthenticated User Cannot Create an Event
**Category**: Security
**Priority**: P0
**Preconditions**: No JWT token (logged out)
**Steps**:
1. Send `POST /api/events` without an Authorization header
**Expected Results**:
- HTTP 401 Unauthorized response
- Event is not created
**Business Rule**: `router.use(authMiddleware)` — all event routes require authentication
**Suggested Layer**: API

---

### TC-201: Unauthenticated User Cannot List Events
**Category**: Security
**Priority**: P0
**Preconditions**: No JWT token
**Steps**:
1. Send `GET /api/events` without an Authorization header
**Expected Results**:
- HTTP 401 Unauthorized response
**Business Rule**: authMiddleware applied to all routes in eventRoutes.js
**Suggested Layer**: API

---

### TC-202: Unauthenticated User Cannot Delete an Event
**Category**: Security
**Priority**: P0
**Preconditions**: No JWT token; a known event ID exists
**Steps**:
1. Send `DELETE /api/events/:id` without an Authorization header
**Expected Results**:
- HTTP 401 Unauthorized response
- Event is not deleted
**Business Rule**: authMiddleware on all event routes
**Suggested Layer**: API

---

### TC-203: User Cannot View Another User's Dynamic Event via GET /api/events/:id
**Category**: Security
**Priority**: P1
**Preconditions**: User A has created a dynamic event; logged in as User B
**Steps**:
1. As User B, send `GET /api/events/:userADynamicEventId`
**Expected Results**:
- HTTP 404 response (event not found for this user — ownership filter hides it)
- User B cannot infer whether the event exists
**Business Rule**: eventRepository.js `findById` — `OR: [{ isStatic: true }, { userId }]` — non-owned dynamic events are invisible
**Suggested Layer**: API

---

### TC-204: Expired JWT Cannot Access Event Endpoints
**Category**: Security
**Priority**: P1
**Preconditions**: An expired JWT token (7-day expiry exceeded)
**Steps**:
1. Send `GET /api/events` with an expired JWT in Authorization header
**Expected Results**:
- HTTP 401 Unauthorized response
**Business Rule**: JWT 7-day expiry enforced by authMiddleware
**Suggested Layer**: API

---

### TC-205: Tampered JWT Rejected
**Category**: Security
**Priority**: P1
**Preconditions**: A valid JWT with tampered payload (e.g., userId changed)
**Steps**:
1. Modify the JWT payload to reference a different userId
2. Send `POST /api/events` with tampered JWT
**Expected Results**:
- HTTP 401 Unauthorized response
- Event creation fails
**Business Rule**: JWT signature verification in authMiddleware
**Suggested Layer**: API

---

### TC-206: FIFO Pruning Cannot Be Triggered on Another User's Events
**Category**: Security
**Priority**: P1
**Preconditions**: User A has 6 dynamic events; logged in as User B with 0 events
**Steps**:
1. As User B, create 7 events
**Expected Results**:
- User B's FIFO pruning only deletes User B's oldest event
- User A's 6 events are completely unaffected
**Business Rule**: `countUserDynamic(userId)` and `findOldestUserDynamic(userId)` are scoped per user
**Suggested Layer**: API

---

## Negative / Error (TC-300–TC-399)

### TC-300: Create Event with Missing Required Field — Title
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with all fields except `title`
**Expected Results**:
- HTTP 400 with `{ success: false, error: "Validation failed", details: [{ field: "title", message: "Title is required" }] }`
**Business Rule**: eventValidator.js — `body('title').notEmpty()`
**Suggested Layer**: API

---

### TC-301: Create Event with Past Date
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `eventDate` set to yesterday's date
**Expected Results**:
- HTTP 400 with `{ details: [{ field: "eventDate", message: "Event date must be in the future" }] }`
**Business Rule**: eventValidator.js custom validator — `new Date(value) <= new Date()`
**Suggested Layer**: API

---

### TC-302: Create Event with Zero or Negative Price
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `price: -1`
**Expected Results**:
- HTTP 400 with `{ details: [{ field: "price", message: "Price must be a non-negative number" }] }`
**Business Rule**: eventValidator.js — `isFloat({ min: 0 })` (price: -1 fails; price: 0 should pass)
**Suggested Layer**: API

---

### TC-303: Create Event with Zero Seats
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `totalSeats: 0`
**Expected Results**:
- HTTP 400 with `{ details: [{ field: "totalSeats", message: "Total seats must be a positive integer" }] }`
**Business Rule**: eventValidator.js — `isInt({ min: 1 })`
**Suggested Layer**: API

---

### TC-304: Create Event with Invalid Image URL
**Category**: Negative
**Priority**: P2
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `imageUrl: "not-a-url"`
**Expected Results**:
- HTTP 400 with `{ details: [{ field: "imageUrl", message: "Image URL must be a valid URL" }] }`
**Business Rule**: eventValidator.js — `isURL()` validation on optional imageUrl
**Suggested Layer**: API

---

### TC-305: Get Non-Existent Event Returns 404
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. Send `GET /api/events/999999`
**Expected Results**:
- HTTP 404 with `{ success: false, error: "Event with id 999999 not found" }`
**Business Rule**: eventService.js `getEventById` — `throw new NotFoundError`
**Suggested Layer**: API

---

### TC-306: Delete Non-Existent Event Returns 404
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid JWT token
**Steps**:
1. Send `DELETE /api/events/999999`
**Expected Results**:
- HTTP 404 with `{ success: false, error: "Event with id 999999 not found" }`
**Business Rule**: eventService.js `deleteEvent` — `throw new NotFoundError`
**Suggested Layer**: API

---

### TC-307: Update Event with Non-ISO Date Format
**Category**: Negative
**Priority**: P2
**Preconditions**: Valid JWT token; user owns an event with known ID
**Steps**:
1. Send `PUT /api/events/:id` with `eventDate: "25-12-2026"` (DD-MM-YYYY)
**Expected Results**:
- HTTP 400 with `{ details: [{ field: "eventDate", message: "Event date must be a valid ISO 8601 date" }] }`
**Business Rule**: eventValidator.js — `isISO8601()` validation
**Suggested Layer**: API

---

### TC-308: Create Event with Non-Integer Seats (Decimal)
**Category**: Negative
**Priority**: P2
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `totalSeats: 50.5`
**Expected Results**:
- HTTP 400 with `{ details: [{ field: "totalSeats", message: "Total seats must be a positive integer" }] }`
**Business Rule**: eventValidator.js — `isInt({ min: 1 })`
**Suggested Layer**: API

---

### TC-309: Optimistic Delete Rollback on API Error
**Category**: Negative
**Priority**: P2
**Preconditions**: User is on `/admin/events`; server is temporarily unreachable or returns error
**Steps**:
1. Click "Delete" on an event and confirm
2. Server responds with an error
**Expected Results**:
- Event reappears in the table (snapshot restored from React Query cache)
- Error toast is displayed with the error message
**Business Rule**: admin/events/page.tsx — optimistic delete with rollback on `onError`
**Suggested Layer**: E2E

---

## Edge Cases (TC-400–TC-499)

### TC-400: Create Exactly the 6th Event — No Pruning Occurs
**Category**: Edge Case
**Priority**: P0
**Preconditions**: User has exactly 5 user-created events
**Steps**:
1. Create the 6th event
2. Verify all 6 events still exist
**Expected Results**:
- 6th event created successfully
- No event was pruned (count was 5 before creation; pruning fires only when `count >= 6`)
- All 6 events are accessible
**Business Rule**: eventService.js — `if (count >= MAX_USER_DYNAMIC_EVENTS)` — prune fires at count=6, not count=5
**Suggested Layer**: API

---

### TC-401: Create Multiple Events Rapidly — FIFO Order Preserved
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User has 6 events; events named E1–E6 with known `createdAt` timestamps
**Steps**:
1. Create E7 and immediately create E8 (before E7's response is stored)
**Expected Results**:
- E1 (oldest) is deleted when E7 is created
- E2 (second oldest) is deleted when E8 is created
- Final state: E3, E4, E5, E6, E7, E8
**Business Rule**: `findOldestUserDynamic` uses `orderBy: { createdAt: 'asc' }` — strict FIFO by DB timestamp
**Suggested Layer**: API

---

### TC-402: Event with Price = 0 (Free Event) Is Allowed
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `price: 0`
**Expected Results**:
- HTTP 201 — event created with price 0.00
- No validation error (price must be `>= 0`, not `> 0`)
**Business Rule**: eventValidator.js — `isFloat({ min: 0 })` — zero is valid
**Suggested Layer**: API

---

### TC-403: Event with Minimum 1 Seat
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `totalSeats: 1`
**Expected Results**:
- HTTP 201 — event created with `totalSeats: 1` and `availableSeats: 1`
**Business Rule**: eventValidator.js — `isInt({ min: 1 })` — 1 is the minimum valid value
**Suggested Layer**: API

---

### TC-404: Delete Event That Has Been FIFO-Pruned — Double Delete Scenario
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User has 6 events; E1 is the oldest; UI is open showing E1
**Steps**:
1. Create a 7th event via API (E1 is now auto-pruned in the background)
2. In UI, click "Delete" on E1 (which no longer exists in DB)
**Expected Results**:
- API returns 404 for the delete request
- UI shows error toast with the server error message
- UI rolls back to cached state (no phantom event remains)
**Business Rule**: Optimistic delete rollback; eventService.js 404 on missing event
**Suggested Layer**: E2E

---

### TC-405: Sandbox Warning Banner Threshold — Exactly 5 Events Shown
**Category**: Edge Case
**Priority**: P2
**Preconditions**: The events list returns exactly 5 events (e.g., filter applied to show exactly 5 results)
**Steps**:
1. Navigate to `/events` with a filter that results in exactly 5 events shown
**Expected Results**:
- Warning banner is NOT visible (`events.length > 5` is false for length=5)
**Business Rule**: events/page.tsx — `{events.length > 5 && <banner />}` — strictly greater than 5
**Suggested Layer**: E2E

---

### TC-406: Sandbox Warning Banner Threshold — Exactly 6 Events Shown
**Category**: Edge Case
**Priority**: P2
**Preconditions**: The events list returns exactly 6 events
**Steps**:
1. Navigate to `/events` with a result set of exactly 6 events
**Expected Results**:
- Warning banner IS visible (6 > 5 is true)
**Business Rule**: events/page.tsx — `{events.length > 5 && <banner />}`
**Suggested Layer**: E2E

---

### TC-407: User Deletes All 6 Events Manually — Can Create Fresh 6 Without Pruning
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User has 6 events
**Steps**:
1. Delete all 6 events manually via UI
2. Create 6 new events
**Expected Results**:
- No pruning occurs during the new 6 creations (count was 0 before each)
- All 6 new events are present after the last creation
**Business Rule**: FIFO pruning only fires when `count >= 6` at the time of creation
**Suggested Layer**: E2E

---

### TC-408: Description Field Is Optional — Event Created Without It
**Category**: Edge Case
**Priority**: P3
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` omitting the `description` field
**Expected Results**:
- HTTP 201 — event created; `description` defaults to `''`
**Business Rule**: eventService.js `createEvent` — `description: data.description || ''`
**Suggested Layer**: API

---

### TC-409: imageUrl Field Is Optional — Omitted and Null in Response
**Category**: Edge Case
**Priority**: P3
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` without `imageUrl`
**Expected Results**:
- HTTP 201 — event created; `imageUrl` is `null` in response
**Business Rule**: eventService.js — `imageUrl: data.imageUrl || null`; validator uses `.optional({ checkFalsy: true })`
**Suggested Layer**: API

---

### TC-410: Event Date Exactly at Current Timestamp Is Rejected
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid JWT token
**Steps**:
1. Send `POST /api/events` with `eventDate` equal to `new Date().toISOString()` (current time)
**Expected Results**:
- HTTP 400 — "Event date must be in the future" (validator uses `<=`, so present moment is invalid)
**Business Rule**: eventValidator.js — `if (new Date(value) <= new Date())`
**Suggested Layer**: API

---

## UI State (TC-500–TC-599)

### TC-500: Loading State — Spinner Shows While Events Fetch
**Category**: UI State
**Priority**: P2
**Preconditions**: User is logged in; network is slow or throttled
**Steps**:
1. Navigate to `/admin/events` with network throttled
**Expected Results**:
- Large spinner (`<Spinner size="lg" />`) is visible in the table area while `isLoading` is true
- Table is not rendered until data arrives
**Business Rule**: admin/events/page.tsx — `{isLoading ? <Spinner> : ...}` conditional
**Suggested Layer**: E2E

---

### TC-501: Empty State — No Events Yet Message
**Category**: UI State
**Priority**: P2
**Preconditions**: User is logged in with 0 user-created events AND 0 static events visible (or account is empty)
**Steps**:
1. Navigate to `/admin/events`
2. No events returned from API
**Expected Results**:
- `EmptyState` component renders with title "No events yet" and description "Create your first event using the form above."
**Business Rule**: admin/events/page.tsx — `events.length === 0` branch
**Suggested Layer**: E2E

---

### TC-502: Static Events Show "Featured" Badge and "Read-only" in Actions
**Category**: UI State
**Priority**: P1
**Preconditions**: Seeded static events are present; user is on `/admin/events`
**Steps**:
1. Navigate to `/admin/events`
2. Observe rows for seeded events
**Expected Results**:
- Static events display a green "Featured" badge next to the title
- Actions column shows "Read-only" text (italic, gray) instead of Edit/Delete buttons
- No Edit button (`data-testid="edit-event-btn"`) exists for static event rows
**Business Rule**: admin/events/page.tsx — `{event.isStatic ? <Read-only> : <Edit/Delete>}`
**Suggested Layer**: E2E

---

### TC-503: Seat Availability Color Coding in Admin Events Table
**Category**: UI State
**Priority**: P2
**Preconditions**: User has events with 0, ≤10, and >10 available seats
**Steps**:
1. Navigate to `/admin/events`
2. Observe the Seats column colors
**Expected Results**:
- 0 available seats: `text-red-600` (red)
- 1–10 available seats: `text-amber-600` (amber/orange)
- >10 available seats: `text-emerald-600` (green)
**Business Rule**: admin/events/page.tsx — conditional className on availableSeats
**Suggested Layer**: E2E

---

### TC-504: Edit Form Pre-Populates with Existing Event Data
**Category**: UI State
**Priority**: P1
**Preconditions**: User has at least one user-created event
**Steps**:
1. Navigate to `/admin/events`
2. Click "Edit" on a user-created event
**Expected Results**:
- Page scrolls to top (`window.scrollTo` is called)
- Form header changes from "+ New Event" to "✏️ Edit Event"
- All form fields are pre-populated with the existing event's values
**Business Rule**: admin/events/page.tsx — `handleEdit` sets `selectedEvent`; form title uses `selectedEvent` ternary
**Suggested Layer**: E2E

---

### TC-505: Delete Confirmation Dialog Appears Before Deletion
**Category**: UI State
**Priority**: P1
**Preconditions**: User has at least one user-created event
**Steps**:
1. Navigate to `/admin/events`
2. Click "Delete" on a user-created event
**Expected Results**:
- `ConfirmDialog` opens with title "Delete this event?"
- Description: "This will permanently delete the event and all associated bookings. This cannot be undone."
- Confirm button label: "Delete event"
- Dialog can be dismissed without deleting by clicking Close/Cancel
**Business Rule**: admin/events/page.tsx — `ConfirmDialog` with `isOpen={deletingId !== null}`
**Suggested Layer**: E2E

---

### TC-506: Pagination Appears When More Than One Page of Events Exists
**Category**: UI State
**Priority**: P2
**Preconditions**: Total events (static + user-created) exceed 10
**Steps**:
1. Navigate to `/admin/events` (default limit = 10)
**Expected Results**:
- Pagination component is rendered below the table
- "Total: N" count is shown in the table header
- Clicking next page loads the next batch
**Business Rule**: admin/events/page.tsx — `pagination.totalPages > 1` condition
**Suggested Layer**: E2E

---

### TC-507: Warning Banner Hidden When Event Count Is 5 or Fewer on Events Page
**Category**: UI State
**Priority**: P2
**Preconditions**: The `/events` page is showing ≤5 events (e.g., tight search filter)
**Steps**:
1. Navigate to `/events` with a search term that matches ≤5 events
**Expected Results**:
- Amber sandbox warning banner is NOT present in the DOM
**Business Rule**: events/page.tsx — `{events.length > 5 && <banner />}`
**Suggested Layer**: E2E

---

### TC-508: Error State on Events Page Shows Retry Button
**Category**: UI State
**Priority**: P2
**Preconditions**: Backend is unreachable; user navigates to `/events`
**Steps**:
1. Stop the backend server
2. Navigate to `/events`
**Expected Results**:
- `EmptyState` renders with title "Couldn't load events" and description about server connection
- A "Retry" button is displayed
- Clicking "Retry" re-triggers the API call
**Business Rule**: events/page.tsx — `isError` branch with `refetch()` on button click
**Suggested Layer**: E2E

---

### TC-509: "Total N" Counter in Admin Events Table Header Updates After Creation/Deletion
**Category**: UI State
**Priority**: P3
**Preconditions**: User is on `/admin/events`
**Steps**:
1. Note the current "N total" count in the table header
2. Create a new event
3. Note updated count
4. Delete an event
5. Note updated count again
**Expected Results**:
- Count increments by 1 after creation
- Count decrements by 1 after deletion
- Count is driven by `pagination.total` from the API
**Business Rule**: admin/events/page.tsx — `<span>{pagination.total} total</span>`
**Suggested Layer**: E2E

---

*Total scenarios: 45 | P0: 10 | P1: 18 | P2: 14 | P3: 3*
