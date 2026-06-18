import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

const BASE_URL        = 'https://eventhub.rahulshettyacademy.com';

dotenv.config();

const USER_EMAIL      = process.env.USER_EMAIL;
const USER_PASSWORD   = process.env.USER_PASSWORD;
const USER_B_EMAIL    = process.env.USER_B_EMAIL;
const USER_B_PASSWORD = process.env.USER_B_PASSWORD;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page, email = USER_EMAIL, password = USER_PASSWORD) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.getByRole('link', { name: /Browse Events/i }).first()).toBeVisible();
}

/**
 * Creates a dynamic event via the admin UI. Returns the title used.
 */
async function createEvent(page, {
  title       = `Test Event ${Date.now()}`,
  category    = 'Conference',
  city        = 'Bangalore',
  venue       = 'Test Venue',
  seats       = 10,
  price       = 100,
  description = '',
} = {}) {
  await page.goto(`${BASE_URL}/admin/events`);
  await page.locator('#event-title-input').fill(title);
  if (description) await page.locator('#admin-event-form textarea').fill(description);
  await page.getByLabel('Category').selectOption(category);
  await page.getByLabel('City').fill(city);
  await page.getByLabel('Venue').fill(venue);
  await page.getByLabel('Event Date & Time').fill('2030-12-31T10:00');
  await page.getByLabel('Price ($)').fill(String(price));
  await page.getByLabel('Total Seats').fill(String(seats));
  await page.locator('#add-event-btn').click();
  await expect(page.getByText('Event created!')).toBeVisible();
  return title;
}

async function clearBookings(page) {
  await page.goto(`${BASE_URL}/bookings`);
  const alreadyEmpty = await page.getByText('No bookings yet').isVisible().catch(() => false);
  if (alreadyEmpty) return;
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /clear all bookings/i }).click();
  await expect(page.getByText('No bookings yet')).toBeVisible();
}

/**
 * Navigate to /events, search for a dynamically-created event title, and return its card.
 * Only reliable for events the current user created (not seeded events in hosted env).
 */
async function findEventCard(page, eventTitle) {
  await page.goto(`${BASE_URL}/events`);
  await page.getByPlaceholder(/search events/i).fill(eventTitle);
  await expect(page).toHaveURL(/search=/, { timeout: 5000 });
  const card = page.getByTestId('event-card').filter({ hasText: eventTitle });
  await expect(card.first()).toBeVisible({ timeout: 10000 });
  return card.first();
}

// ── Group 1: Happy Path — Event List ──────────────────────────────────────────

test.describe('Happy Path — Event List', () => {

  // TC-001
  test('TC-001: authenticated user sees event cards on /events', async ({ page }) => {
    // -- Step 1: Login --
    await login(page);

    // -- Step 2: Navigate to events list --
    await page.goto(`${BASE_URL}/events`);

    // -- Step 3: Assert page heading and card grid --
    await expect(page.getByRole('heading', { name: 'Upcoming Events' })).toBeVisible();
    await expect(page.getByText('Find your next unforgettable experience')).toBeVisible();
    const cards = page.getByTestId('event-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
  });

  // TC-002
  test('TC-002: search by title keyword filters event cards', async ({ page }) => {
    // -- Step 1: Login, create a uniquely titled event, navigate --
    await login(page);
    const searchTerm = `SrchTest${Date.now()}`;
    await createEvent(page, { title: `${searchTerm} Event A` });
    await createEvent(page, { title: `${searchTerm} Event B` });

    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    const totalBefore = await page.getByTestId('event-card').count();

    // -- Step 2: Search for the unique term and wait for URL update --
    await page.getByPlaceholder(/search events/i).fill(searchTerm);
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });
    // Wait for matching card to appear
    await expect(page.getByTestId('event-card').filter({ hasText: `${searchTerm} Event A` }).first()).toBeVisible({ timeout: 10000 });

    // -- Step 3: Assert count reduced and only matching cards visible --
    const filteredCount = await page.getByTestId('event-card').count();
    expect(filteredCount).toBeLessThan(totalBefore);
    // All visible cards should match the search term
    for (let i = 0; i < filteredCount; i++) {
      await expect(page.getByTestId('event-card').nth(i)).toContainText(searchTerm);
    }
  });

  // TC-003
  test('TC-003: search by venue keyword returns matching events', async ({ page }) => {
    // -- Step 1: Create event with a unique venue --
    await login(page);
    const uniqueVenue = `UniqVenue${Date.now()}`;
    await createEvent(page, { venue: uniqueVenue });

    // -- Step 2: Search by venue on events page --
    await page.goto(`${BASE_URL}/events`);
    await page.getByPlaceholder(/search events/i).fill(uniqueVenue);
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });

    // -- Step 3: Assert event with that venue is visible --
    await expect(page.getByTestId('event-card').filter({ hasText: uniqueVenue }).first()).toBeVisible({ timeout: 10000 });
  });

  // TC-005
  test('TC-005: category filter shows only events of selected category', async ({ page }) => {
    // -- Step 1: Login and navigate --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    const totalBefore = await page.getByTestId('event-card').count();

    // -- Step 2: Select "Sports" from category dropdown --
    await page.locator('select').first().selectOption('Sports');
    await expect(page).toHaveURL(/category=Sports/);

    // -- Step 3: Wait for Sports results to appear --
    await expect(page.getByTestId('event-card').filter({ hasText: 'Sports' }).first()).toBeVisible({ timeout: 10000 });

    // -- Step 4: Assert count changed and all visible cards are Sports --
    const filteredCount = await page.getByTestId('event-card').count();
    expect(filteredCount).toBeLessThan(totalBefore);
    for (let i = 0; i < filteredCount; i++) {
      await expect(page.getByTestId('event-card').nth(i)).toContainText('Sports');
    }
  });

  // TC-006
  test('TC-006: city filter shows only events in selected city', async ({ page }) => {
    // -- Step 1: Login and navigate --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    const totalBefore = await page.getByTestId('event-card').count();

    // -- Step 2: Select "Mumbai" city filter --
    await page.locator('select').nth(1).selectOption('Mumbai');
    await expect(page).toHaveURL(/city=Mumbai/);

    // -- Step 3: Wait for results to update --
    await page.waitForTimeout(500); // allow React Query refetch to settle
    const filteredCount = await page.getByTestId('event-card').count();
    console.log(`Mumbai event count: ${filteredCount}`);

    // -- Step 4: Assert count is less than total (filter is being applied) --
    expect(filteredCount).toBeLessThan(totalBefore);

    // -- Step 5: Assert each visible card is in Mumbai --
    for (let i = 0; i < filteredCount; i++) {
      await expect(page.getByTestId('event-card').nth(i)).toContainText('Mumbai');
    }
  });

  // TC-007
  test('TC-007: combined category + city filters narrow results', async ({ page }) => {
    // -- Step 1: Login and record total count --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    const totalBefore = await page.getByTestId('event-card').count();

    // -- Step 2: Apply category filter and wait for URL --
    await page.locator('select').first().selectOption('Conference');
    await expect(page).toHaveURL(/category=Conference/);
    await expect(page.getByTestId('event-card').filter({ hasText: 'Conference' }).first()).toBeVisible({ timeout: 10000 });
    const afterCategory = await page.getByTestId('event-card').count();
    expect(afterCategory).toBeLessThan(totalBefore);

    // -- Step 3: Apply city filter on top and wait for URL --
    await page.locator('select').nth(1).selectOption('Bangalore');
    await expect(page).toHaveURL(/city=Bangalore/);
    await page.waitForTimeout(500); // allow React Query refetch

    // -- Step 4: Assert URL contains both params and count is ≤ category-only count --
    await expect(page).toHaveURL(/category=Conference/);
    await expect(page).toHaveURL(/city=Bangalore/);
    const afterBoth = await page.getByTestId('event-card').count();
    expect(afterBoth).toBeLessThanOrEqual(afterCategory);
  });

});

// ── Group 2: Happy Path — Event Detail ───────────────────────────────────────

test.describe('Happy Path — Event Detail', () => {

  // TC-009
  test('TC-009: clicking Book Now navigates to event detail page', async ({ page }) => {
    // -- Step 1: Login and navigate to events list --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    const firstCard = page.getByTestId('event-card').first();
    await expect(firstCard).toBeVisible();

    // -- Step 2: Capture event title and click Book Now --
    const eventTitle = (await firstCard.locator('h3').textContent() ?? '').trim();
    await firstCard.getByTestId('book-now-btn').click();

    // -- Step 3: Assert URL is event detail and title matches --
    await expect(page).toHaveURL(/\/events\/\d+/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(eventTitle);
  });

  // TC-010
  test('TC-010: event detail page shows all meta information', async ({ page }) => {
    // -- Step 1: Login and navigate to any event detail --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await page.getByTestId('book-now-btn').first().click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    // -- Step 2: Assert all meta item labels visible (exact match to prevent ambiguity) --
    await expect(page.getByText('Date',             { exact: true })).toBeVisible();
    await expect(page.getByText('Time',             { exact: true })).toBeVisible();
    await expect(page.getByText('Venue',            { exact: true })).toBeVisible();
    await expect(page.getByText('City',             { exact: true })).toBeVisible();
    await expect(page.getByText('Available',        { exact: true })).toBeVisible();
    await expect(page.getByText('Price per ticket', { exact: true })).toBeVisible();

    // -- Step 3: Assert breadcrumb in main area --
    await expect(page.getByRole('main').getByRole('link', { name: 'Events', exact: true })).toBeVisible();

    // -- Step 4: Assert booking panel header --
    await expect(page.getByRole('heading', { name: 'Book Tickets' })).toBeVisible();
  });

  // TC-011
  test('TC-011: static (Featured) event shows Featured badge and info banner', async ({ page }) => {
    // -- Step 1: Login and navigate to events list --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();

    // -- Step 2: Find any card with a "Featured" badge --
    const featuredCard = page.getByTestId('event-card').filter({ hasText: 'Featured' }).first();
    await expect(featuredCard).toBeVisible({ timeout: 10000 });

    // -- Step 3: Navigate to its detail page --
    await featuredCard.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    // -- Step 4: Assert Featured badge and static event banner on detail page --
    await expect(page.getByText('Featured').first()).toBeVisible();
    await expect(page.getByText(/always available for practice/i)).toBeVisible();
  });

  // TC-012
  test('TC-012: breadcrumb "Events" link navigates back to events list', async ({ page }) => {
    // -- Step 1: Navigate to any event detail page --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await page.getByTestId('book-now-btn').first().click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    // -- Step 2: Click breadcrumb "Events" link (scoped to main to avoid nav/footer links) --
    await page.getByRole('main').getByRole('link', { name: 'Events', exact: true }).click();

    // -- Step 3: Assert back on events list --
    await expect(page).toHaveURL(`${BASE_URL}/events`);
    await expect(page.getByRole('heading', { name: 'Upcoming Events' })).toBeVisible();
  });

});

// ── Group 3: Business Rules ───────────────────────────────────────────────────

test.describe('Business Rules', () => {

  // TC-100
  test('TC-100: sandbox warning banner appears when more than 5 events visible', async ({ page }) => {
    // -- Step 1: Login and navigate to events with no filters --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();

    // -- Step 2: Assert 6+ events are visible (hosted env always has many) --
    const cards = page.getByTestId('event-card');
    expect(await cards.count()).toBeGreaterThan(5);

    // -- Step 3: Assert sandbox warning banner with correct text --
    await expect(page.getByText(/sandbox holds up to/i)).toBeVisible();
    await expect(page.getByText(/9 bookings/)).toBeVisible();
    await expect(page.getByText(/6 custom events/)).toBeVisible();
  });

  // TC-101
  test('TC-101: sandbox warning banner hidden when 5 or fewer events visible', async ({ page }) => {
    // -- Step 1: Login and create a uniquely named event to search for --
    await login(page);
    const uniqueSearch = `BannerTest${Date.now()}`;
    await createEvent(page, { title: uniqueSearch });

    // -- Step 2: Navigate to events and search for uniquely named event (returns 1 result) --
    await page.goto(`${BASE_URL}/events`);
    await page.getByPlaceholder(/search events/i).fill(uniqueSearch);
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });
    await expect(page.getByTestId('event-card').filter({ hasText: uniqueSearch }).first()).toBeVisible({ timeout: 10000 });

    // -- Step 3: Assert count ≤ 5 and banner NOT visible --
    const count = await page.getByTestId('event-card').count();
    console.log(`Events after unique search: ${count}`);
    expect(count).toBeLessThanOrEqual(5);
    await expect(page.getByText(/sandbox holds up to/i)).not.toBeVisible();
  });

  // TC-103 (+ TC-102: per-user seat computation)
  test('TC-103: available seats decrease after booking (per-user computation)', async ({ page }) => {
    // -- Step 1: Login and clear existing bookings --
    await login(page);
    await clearBookings(page);

    // -- Step 2: Navigate to any available event detail page --
    await page.goto(`${BASE_URL}/events`);
    // Find first non-sold-out event (title text is a link, book-now-btn says "Book Now")
    const availableCard = page.getByTestId('event-card').filter({ hasText: 'Book Now' }).first();
    await expect(availableCard).toBeVisible();
    await availableCard.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);
    const eventDetailUrl = page.url();

    // -- Step 3: Capture available seat count before booking --
    const seatsEl = page.getByText(/\d+ \/ \d+ seats/);
    await expect(seatsEl).toBeVisible();
    const beforeText = await seatsEl.textContent() ?? '';
    const seatsBefore = parseInt(beforeText.split('/')[0].trim(), 10);
    console.log(`Seats before booking: ${seatsBefore}`);

    // -- Step 4: Book 2 tickets --
    const plusBtn = page.getByRole('button', { name: '+' });
    await expect(plusBtn).toBeEnabled();
    await plusBtn.click(); // quantity → 2
    await expect(page.locator('#ticket-count')).toContainText('2');
    await page.getByLabel('Full Name').fill('Test User');
    await page.locator('#customer-email').fill('testuser@example.com');
    await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
    await page.locator('.confirm-booking-btn').click();
    await expect(page.locator('.booking-ref').first()).toBeVisible();
    console.log('Booking confirmed with 2 tickets.');

    // -- Step 5: Navigate back to event detail and verify seat decrease --
    await page.goto(eventDetailUrl);
    await expect(seatsEl).toBeVisible();
    const afterText = await seatsEl.textContent() ?? '';
    const seatsAfter = parseInt(afterText.split('/')[0].trim(), 10);
    console.log(`Seats after booking: ${seatsAfter}`);
    expect(seatsAfter).toBe(seatsBefore - 2);
  });

  // TC-106 + TC-505
  test('TC-106: sold-out event shows SOLD OUT text and disabled button', async ({ page }) => {
    // -- Step 1: Login and create a 1-seat event --
    await login(page);
    await clearBookings(page);
    const eventTitle = await createEvent(page, { title: `SoldOut ${Date.now()}`, seats: 1, price: 50 });

    // -- Step 2: Find event and navigate to detail page --
    const card = await findEventCard(page, eventTitle);
    await card.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);
    const eventDetailUrl = page.url();

    // -- Step 3: Confirm 1 available seat and book it --
    await expect(page.getByText(/1 \/ 1 seats/)).toBeVisible();
    await page.getByLabel('Full Name').fill('Test User');
    await page.locator('#customer-email').fill('testuser@example.com');
    await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
    await page.locator('.confirm-booking-btn').click();
    await expect(page.locator('.booking-ref').first()).toBeVisible();
    console.log('Seat exhausted. Verifying sold-out state...');

    // -- Step 4: Navigate directly back to same event detail URL --
    await page.goto(eventDetailUrl);

    // -- Step 5: Assert SOLD OUT state --
    await expect(page.getByText('SOLD OUT').first()).toBeVisible();
    const confirmBtn = page.locator('.confirm-booking-btn');
    await expect(confirmBtn).toBeDisabled();
    await expect(confirmBtn).toContainText('Sold Out');
  });

});

// ── Group 4: Pagination ───────────────────────────────────────────────────────

test.describe('Pagination', () => {

  // TC-008 + TC-105: Uses route mocking for deterministic pagination state
  test('TC-105/TC-008: events list shows 12 per page and pagination navigates correctly', async ({ page }) => {
    await login(page);

    const makeEvent = (i) => ({
      id: 1000 + i, title: `Mock Event ${i}`, description: '',
      category: 'Conference', venue: `Venue ${i}`, city: 'Bangalore',
      eventDate: new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
      price: '100', totalSeats: 100, availableSeats: 100,
      isStatic: true, userId: null, imageUrl: null,
    });

    const page1Events = Array.from({ length: 12 }, (_, i) => makeEvent(i));
    const page2Events = Array.from({ length: 3  }, (_, i) => makeEvent(12 + i));

    // -- Step 1: Mock API to return paginated data --
    await page.route('**/api/events**', async (route) => {
      const url = new URL(route.request().url());
      const pageNum = Number(url.searchParams.get('page') || 1);
      const data = pageNum === 2 ? page2Events : page1Events;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true, data,
          pagination: { page: pageNum, limit: 12, total: 15, totalPages: 2 },
        }),
      });
    });

    // -- Step 2: Navigate and assert 12 cards on page 1 --
    await page.goto(`${BASE_URL}/events`);
    const cards = page.getByTestId('event-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBe(12);

    // -- Step 3: Assert pagination controls visible --
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /prev/i })).toBeDisabled();

    // -- Step 4: Navigate to page 2 --
    await page.getByRole('button', { name: '2' }).click();
    await expect(page).toHaveURL(/page=2/);

    // -- Step 5: Assert 3 cards on page 2 --
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBe(3);

    // -- Step 6: Assert Prev enabled, Next disabled on last page --
    await expect(page.getByRole('button', { name: /prev/i })).not.toBeDisabled();
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled();
  });

});

// ── Group 5: Security ─────────────────────────────────────────────────────────

test.describe('Security', () => {

  // TC-200
  test('TC-200: unauthenticated user is redirected away from /events', async ({ page }) => {
    await page.goto(`${BASE_URL}/events`);
    await expect(page).toHaveURL(`${BASE_URL}/login`);
  });

  // TC-201
  test('TC-201: unauthenticated user is redirected away from /events/:id', async ({ page }) => {
    await page.goto(`${BASE_URL}/events/1`);
    await expect(page).toHaveURL(`${BASE_URL}/login`);
  });

  // TC-204
  test("TC-204: User B cannot see User A's dynamic events in the list", async ({ page, browser }) => {
    // -- Step 1: User A creates a uniquely titled event --
    await login(page, USER_EMAIL, USER_PASSWORD);
    const uniqueTitle = `UserA Only ${Date.now()}`;
    await createEvent(page, { title: uniqueTitle });
    console.log(`User A created: "${uniqueTitle}"`);

    // -- Step 2: User B logs in and searches for that event --
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, USER_B_EMAIL, USER_B_PASSWORD);
    await pageB.goto(`${BASE_URL}/events`);
    await pageB.getByPlaceholder(/search events/i).fill(uniqueTitle);
    await expect(pageB).toHaveURL(/search=/, { timeout: 5000 });
    await pageB.waitForTimeout(1000);

    // -- Step 3: Assert User B does NOT see User A's event --
    const matchingCards = pageB.getByTestId('event-card').filter({ hasText: uniqueTitle });
    expect(await matchingCards.count()).toBe(0);

    await contextB.close();
  });

  // TC-206
  test('TC-206: XSS in search query param does not execute script', async ({ page }) => {
    await login(page);
    let alertFired = false;
    page.on('dialog', (dialog) => { alertFired = true; dialog.dismiss(); });
    await page.goto(`${BASE_URL}/events?search=%3Cscript%3Ealert(1)%3C%2Fscript%3E`);
    await page.waitForTimeout(1000);
    expect(alertFired).toBe(false);
    await expect(page.getByRole('heading', { name: 'Upcoming Events' })).toBeVisible();
  });

});

// ── Group 6: Error & Negative States ─────────────────────────────────────────

test.describe('Error & Negative States', () => {

  // TC-300
  test('TC-300: no matching search results shows empty state', async ({ page }) => {
    // -- Step 1: Login and navigate to events --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();

    // -- Step 2: Search for a nonsense term --
    await page.getByPlaceholder(/search events/i).fill('xyznonexistent123abc');
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });

    // -- Step 3: Assert empty state --
    await expect(page.getByText('No events found')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/try adjusting your filters/i)).toBeVisible();
    expect(await page.getByTestId('event-card').count()).toBe(0);
  });

  // TC-302
  test('TC-302: navigating to non-existent event shows "Event not found"', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/events/999999`);
    await expect(page.getByText('Event not found')).toBeVisible();
    await expect(page.getByText(/doesn't exist or has been removed/i)).toBeVisible();
    // Scope link to main to avoid matching footer
    await expect(page.getByRole('main').getByRole('link', { name: 'Browse Events' })).toBeVisible();
  });

  // TC-303
  test('TC-303: network error on events list shows error state with Retry button', async ({ page }) => {
    await login(page);
    await page.route('**/api/events**', (route) => route.abort());
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByText("Couldn't load events")).toBeVisible();
    await expect(page.getByText(/problem connecting to the server/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  // TC-304
  test('TC-304: Retry button re-fetches events after network error is resolved', async ({ page }) => {
    await login(page);
    await page.route('**/api/events**', (route) => route.abort());
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByText("Couldn't load events")).toBeVisible();
    await page.unroute('**/api/events**');
    await page.getByRole('button', { name: /retry/i }).click();
    await expect(page.getByTestId('event-card').first()).toBeVisible({ timeout: 15000 });
  });

  // TC-305
  test('TC-305: clearing search restores all events', async ({ page }) => {
    // -- Step 1: Login and navigate --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    const totalCount = await page.getByTestId('event-card').count();

    // -- Step 2: Apply a restrictive filter then clear it --
    await page.getByPlaceholder(/search events/i).fill('Conference');
    await expect(page).toHaveURL(/search=Conference/, { timeout: 5000 });
    await expect(page.getByTestId('event-card').filter({ hasText: 'Conference' }).first()).toBeVisible({ timeout: 10000 });
    const filteredCount = await page.getByTestId('event-card').count();
    console.log(`Total: ${totalCount}, Filtered (Conference): ${filteredCount}`);

    // -- Step 3: Clear search and wait for search param to leave URL --
    await page.getByPlaceholder(/search events/i).fill('');
    await expect(page).not.toHaveURL(/search=/, { timeout: 5000 });

    // -- Step 4: Assert card count returns to original total --
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    const restoredCount = await page.getByTestId('event-card').count();
    expect(restoredCount).toBe(totalCount);
  });

});

// ── Group 7: Edge Cases ───────────────────────────────────────────────────────

test.describe('Edge Cases', () => {

  // TC-403
  test('TC-403: event with 1 available seat caps ticket quantity at 1', async ({ page }) => {
    // -- Step 1: Login and create a 1-seat event --
    await login(page);
    const eventTitle = await createEvent(page, { title: `OneSeat ${Date.now()}`, seats: 1 });

    // -- Step 2: Navigate to that event's detail page --
    const card = await findEventCard(page, eventTitle);
    await card.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    // -- Step 3: Assert quantity = 1 and "+" is disabled --
    await expect(page.locator('#ticket-count')).toContainText('1');
    await expect(page.getByRole('button', { name: '+' })).toBeDisabled();

    // -- Step 4: Assert "(max 1)" label --
    await expect(page.getByText('(max 1)')).toBeVisible();
  });

  // TC-404
  test('TC-404: applied filters survive a page refresh', async ({ page }) => {
    // -- Step 1: Login and apply category filter --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await page.locator('select').first().selectOption('Conference');
    await expect(page).toHaveURL(/category=Conference/);
    await expect(page.getByTestId('event-card').filter({ hasText: 'Conference' }).first()).toBeVisible({ timeout: 10000 });
    const countBefore = await page.getByTestId('event-card').count();

    // -- Step 2: Reload the page --
    await page.reload();

    // -- Step 3: Assert filter param still in URL and results consistent --
    await expect(page).toHaveURL(/category=Conference/);
    await expect(page.getByTestId('event-card').filter({ hasText: 'Conference' }).first()).toBeVisible({ timeout: 10000 });
    const countAfter = await page.getByTestId('event-card').count();
    expect(Math.abs(countAfter - countBefore)).toBeLessThanOrEqual(1); // allow ±1 for dynamic content
  });

  // TC-406
  test('TC-406: event without description hides "About this event" section', async ({ page }) => {
    // -- Step 1: Create event with NO description --
    await login(page);
    const eventTitle = await createEvent(page, { title: `NoDesc ${Date.now()}`, description: '' });

    // -- Step 2: Navigate to that event's detail page --
    const card = await findEventCard(page, eventTitle);
    await card.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    // -- Step 3: Assert "About this event" section is NOT visible --
    await expect(page.getByRole('heading', { name: 'About this event' })).not.toBeVisible();
  });

  // TC-407
  test('TC-407: clearing one filter preserves the other active filter', async ({ page }) => {
    // -- Step 1: Apply category + city filter --
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();

    await page.locator('select').first().selectOption('Festival');
    await expect(page).toHaveURL(/category=Festival/);
    await expect(page.getByTestId('event-card').filter({ hasText: 'Festival' }).first()).toBeVisible({ timeout: 10000 });

    await page.locator('select').nth(1).selectOption('Bangalore');
    await expect(page).toHaveURL(/city=Bangalore/);
    await page.waitForTimeout(500);

    // -- Step 2: Clear city filter (select "" = All Cities) --
    await page.locator('select').nth(1).selectOption('');
    await expect(page).not.toHaveURL(/city=Bangalore/, { timeout: 5000 });

    // -- Step 3: Assert category filter still active in URL --
    await expect(page).toHaveURL(/category=Festival/);

    // -- Step 4: Assert results updated with at least 1 event --
    await expect(page.getByTestId('event-card').first()).toBeVisible({ timeout: 10000 });
  });

  // TC-013
  test('TC-013: "Add New Event" CTA navigates to admin events page', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    await page.getByRole('link', { name: /Add New Event/i }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/events`);
  });

});
