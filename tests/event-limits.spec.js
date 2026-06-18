import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL      = 'https://eventhub.rahulshettyacademy.com';
const USER_EMAIL    = process.env.USER_EMAIL;
const USER_PASSWORD = process.env.USER_PASSWORD;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@email.com').fill(USER_EMAIL);
  await page.getByLabel('Password').fill(USER_PASSWORD);
  await page.locator('#login-btn').click();
  await expect(page.getByRole('link', { name: /Browse Events/i }).first()).toBeVisible();
}

/**
 * Creates a user event via the admin form.
 * Returns the title used (so callers can track which title was created).
 */
async function createEvent(page, {
  title       = `Test Event ${Date.now()}`,
  category    = 'Conference',
  city        = 'Bangalore',
  venue       = 'Test Venue',
  seats       = 20,
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

/**
 * Deletes all user-created (non-static) events via the admin UI.
 * Static events do not have a delete button, so they are safely skipped.
 * Dynamic events are always on page 2 when 10 static events fill page 1.
 */
async function clearUserEvents(page) {
  for (let i = 0; i < 7; i++) {
    await page.goto(`${BASE_URL}/admin/events`);
    await expect(page.getByTestId('event-table-row').first()).toBeVisible();

    // Check page 1 for delete buttons (would exist if there are fewer than 10 static events)
    let deleteBtn = page.getByTestId('delete-event-btn').first();
    if (await deleteBtn.count() === 0) {
      // Navigate to page 2 where dynamic events appear
      const page2Btn = page.getByRole('button', { name: '2' });
      if (await page2Btn.count() === 0) break; // no page 2 → no dynamic events
      await page2Btn.click();
      await expect(page.getByTestId('event-table-row').first()).toBeVisible();
      deleteBtn = page.getByTestId('delete-event-btn').first();
      if (await deleteBtn.count() === 0) break; // page 2 has no delete buttons either
    }

    await deleteBtn.click();
    await expect(page.locator('#confirm-dialog-yes')).toBeVisible();
    await page.locator('#confirm-dialog-yes').click();
    await expect(page.getByText('Event deleted')).toBeVisible();
  }
}

/**
 * Navigates to the admin events page and returns the row locator for the given title.
 * Checks page 1 first, then page 2 (since dynamic events appear after 10 static events).
 */
async function getAdminEventRow(page, title) {
  await page.goto(`${BASE_URL}/admin/events`);
  await expect(page.getByTestId('event-table-row').first()).toBeVisible();

  let row = page.getByTestId('event-table-row').filter({ hasText: title });
  if (await row.count() > 0) return row;

  // Try page 2
  const page2Btn = page.getByRole('button', { name: '2' });
  if (await page2Btn.count() > 0) {
    await page2Btn.click();
    await expect(page.getByTestId('event-table-row').first()).toBeVisible();
    row = page.getByTestId('event-table-row').filter({ hasText: title });
  }
  return row;
}

/**
 * Searches for an event on the public events page.
 * Waits for the URL to update and returns the first matching card locator.
 */
async function searchEventCard(page, title) {
  await page.goto(`${BASE_URL}/events`);
  await page.getByPlaceholder(/search events/i).fill(title);
  await expect(page).toHaveURL(/search=/, { timeout: 5000 });
  const card = page.getByTestId('event-card').filter({ hasText: title });
  await expect(card.first()).toBeVisible({ timeout: 10000 });
  return card.first();
}

// ── Group 1: Happy Path — Admin Event CRUD ─────────────────────────────────────

test.describe('Happy Path — Admin Event CRUD', () => {

  // TC-001
  test('TC-001: create new event — toast appears and event is discoverable on events page', async ({ page }) => {
    await login(page);

    const title = `CreateTest ${Date.now()}`;

    // -- Step 1: Fill and submit the create form --
    await page.goto(`${BASE_URL}/admin/events`);
    await page.locator('#event-title-input').fill(title);
    await page.getByLabel('Category').selectOption('Workshop');
    await page.getByLabel('City').fill('Mumbai');
    await page.getByLabel('Venue').fill('Convention Centre');
    await page.getByLabel('Event Date & Time').fill('2030-06-15T09:00');
    await page.getByLabel('Price ($)').fill('250');
    await page.getByLabel('Total Seats').fill('50');
    await page.locator('#add-event-btn').click();

    // -- Step 2: Assert success toast --
    await expect(page.getByText('Event created!')).toBeVisible();
    console.log(`Created event: "${title}"`);

    // -- Step 3: Verify event appears in admin table --
    const row = await getAdminEventRow(page, title);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Workshop');
    await expect(row).toContainText('Mumbai');
    await expect(row).toContainText('50/50');
  });

  // TC-003
  test('TC-003: edit user-created event — form switches to edit mode and change is persisted', async ({ page }) => {
    await login(page);
    const original = `EditOrig ${Date.now()}`;
    const updated  = `EditUpd  ${Date.now()}`;
    await createEvent(page, { title: original });

    // -- Step 1: Find the event row and click Edit --
    const row = await getAdminEventRow(page, original);
    await expect(row).toBeVisible();
    await row.getByTestId('edit-event-btn').click();

    // -- Step 2: Assert form header switches to edit mode --
    await expect(page.getByText('✏️ Edit Event')).toBeVisible();
    await expect(page.locator('#add-event-btn')).toContainText('Update Event');

    // -- Step 3: Change the title and save --
    await page.locator('#event-title-input').fill(updated);
    await page.locator('#add-event-btn').click();

    // -- Step 4: Assert success toast and updated title is discoverable --
    await expect(page.getByText('Event updated!')).toBeVisible();
    console.log(`Updated title to: "${updated}"`);
    await searchEventCard(page, updated);
  });

  // TC-004
  test('TC-004: delete user-created event — row removed from table and not findable on events page', async ({ page }) => {
    await login(page);
    const title = `DeleteTest ${Date.now()}`;
    await createEvent(page, { title });

    // -- Step 1: Verify event exists before deletion --
    const rowBefore = await getAdminEventRow(page, title);
    await expect(rowBefore).toBeVisible();
    console.log(`Event "${title}" exists — proceeding with delete.`);

    // -- Step 2: Click Delete and confirm --
    await rowBefore.getByTestId('delete-event-btn').click();
    await expect(page.locator('#confirm-dialog-yes')).toBeVisible();
    await page.locator('#confirm-dialog-yes').click();

    // -- Step 3: Assert success toast --
    await expect(page.getByText('Event deleted')).toBeVisible();

    // -- Step 4: Verify event is no longer findable on the public events page --
    await page.goto(`${BASE_URL}/events`);
    await page.getByPlaceholder(/search events/i).fill(title);
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });
    await expect(page.getByText('No events found')).toBeVisible({ timeout: 10000 });
    console.log(`Confirmed "${title}" is gone from events list.`);
  });

  // TC-005
  test('TC-005: deleting an event cascades — associated booking disappears from bookings page', async ({ page }) => {
    await login(page);
    const title = `CascadeTest ${Date.now()}`;
    await createEvent(page, { title, seats: 5, price: 100 });

    // -- Step 1: Book a ticket on the new event --
    const card = await searchEventCard(page, title);
    await card.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    await page.getByLabel('Full Name').fill('Cascade Tester');
    await page.locator('#customer-email').fill('cascade@example.com');
    await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
    await page.locator('.confirm-booking-btn').click();

    const refEl = page.locator('.booking-ref').first();
    await expect(refEl).toBeVisible();
    const bookingRef = (await refEl.textContent())?.trim() ?? '';
    console.log(`Booked event. Ref: ${bookingRef}`);

    // -- Step 2: Confirm the booking is present on bookings page --
    await page.goto(`${BASE_URL}/bookings`);
    const bookingCard = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await expect(bookingCard).toBeVisible();

    // -- Step 3: Delete the event via admin --
    const row = await getAdminEventRow(page, title);
    await row.getByTestId('delete-event-btn').click();
    await expect(page.locator('#confirm-dialog-yes')).toBeVisible();
    await page.locator('#confirm-dialog-yes').click();
    await expect(page.getByText('Event deleted')).toBeVisible();
    console.log(`Event "${title}" deleted. Checking booking cascade...`);

    // -- Step 4: Verify the booking no longer exists --
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    expect(
      await page.getByTestId('booking-card').filter({ hasText: bookingRef }).count()
    ).toBe(0);
    console.log(`Confirmed booking "${bookingRef}" was cascade-deleted.`);
  });

});

// ── Group 2: Business Rules — FIFO Pruning & Static Events ────────────────────

test.describe('Business Rules — FIFO Pruning & Static Events', () => {

  // TC-100 — P0: Most critical test in this suite
  test('TC-100: creating a 7th event auto-prunes the oldest event (FIFO)', async ({ page }) => {
    test.setTimeout(150_000); // Creating 7 events + clearing state takes ~90s

    await login(page);
    await clearUserEvents(page);
    console.log('Cleared all user events. Starting FIFO test...');

    const ts = Date.now();

    // -- Step 1: Create 6 events sequentially (E1 = oldest, E6 = newest) --
    const titles = [];
    for (let i = 1; i <= 6; i++) {
      const t = `FIFO-E${i}-${ts}`;
      titles.push(t);
      await createEvent(page, { title: t });
      console.log(`Created event ${i}/6: "${t}"`);
    }

    const oldest = titles[0]; // E1 — the one that should be auto-pruned

    // -- Step 2: Verify E1 still exists before creating E7 --
    await searchEventCard(page, oldest);
    console.log(`Confirmed E1 "${oldest}" exists before E7 creation.`);

    // -- Step 3: Create 7th event — this triggers FIFO pruning of E1 --
    const e7 = `FIFO-E7-${ts}`;
    await createEvent(page, { title: e7 });
    console.log(`Created 7th event: "${e7}". Checking FIFO prune...`);

    // -- Step 4: Assert E1 (oldest) has been automatically deleted --
    await page.goto(`${BASE_URL}/events`);
    await page.getByPlaceholder(/search events/i).fill(oldest);
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });
    await expect(page.getByText('No events found')).toBeVisible({ timeout: 10000 });
    console.log(`CONFIRMED: "${oldest}" was pruned (FIFO).`);

    // -- Step 5: Assert E7 (just created) is present --
    await page.getByPlaceholder(/search events/i).fill(e7);
    await expect(page).toHaveURL(/search=/, { timeout: 5000 });
    await expect(page.getByTestId('event-card').filter({ hasText: e7 }).first()).toBeVisible({ timeout: 10000 });
    console.log(`Confirmed E7 "${e7}" is present.`);

    // -- Step 6: Assert E2–E6 all still exist (only E1 was pruned) --
    for (const t of titles.slice(1)) {
      await page.getByPlaceholder(/search events/i).fill(t);
      await expect(page).toHaveURL(/search=/, { timeout: 5000 });
      await expect(page.getByTestId('event-card').filter({ hasText: t }).first()).toBeVisible({ timeout: 10000 });
      console.log(`Confirmed "${t}" still exists.`);
    }
  });

  // TC-103
  test('TC-103: static events show "Read-only" in admin table — no Edit or Delete buttons', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/admin/events`);
    await expect(page.getByTestId('event-table-row').first()).toBeVisible();

    // -- Step 1: Find a row with a "Featured" badge (marks a static event) --
    const staticRow = page.getByTestId('event-table-row').filter({ hasText: 'Featured' }).first();
    await expect(staticRow).toBeVisible();

    // -- Step 2: Assert "Read-only" label and absence of action buttons --
    await expect(staticRow.getByText('Read-only')).toBeVisible();
    expect(await staticRow.getByTestId('edit-event-btn').count()).toBe(0);
    expect(await staticRow.getByTestId('delete-event-btn').count()).toBe(0);
  });

  // TC-108
  test('TC-108: admin events page always shows sandbox limit warning banner', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/admin/events`);

    // -- Assert amber info banner is present regardless of current event count --
    await expect(page.getByText(/6 events/)).toBeVisible();
    await expect(page.getByText(/oldest event is automatically replaced/i)).toBeVisible();
  });

});

// ── Group 3: Edge Cases — Event Limit Boundaries ──────────────────────────────

test.describe('Edge Cases — Event Limit Boundaries', () => {

  // TC-400 — P0: Boundary value — the 6th creation must NOT trigger pruning
  test('TC-400: creating the 6th event does NOT trigger FIFO pruning', async ({ page }) => {
    test.setTimeout(120_000);

    await login(page);
    await clearUserEvents(page);
    console.log('Cleared all user events. Testing 6th-creation boundary...');

    const ts = Date.now();

    // -- Step 1: Create 5 events --
    const titles = [];
    for (let i = 1; i <= 5; i++) {
      const t = `Boundary-E${i}-${ts}`;
      titles.push(t);
      await createEvent(page, { title: t });
      console.log(`Created event ${i}/5: "${t}"`);
    }

    // -- Step 2: Create the 6th event (limit = 6 → no pruning yet) --
    const e6 = `Boundary-E6-${ts}`;
    titles.push(e6);
    await createEvent(page, { title: e6 });
    console.log(`Created 6th event: "${e6}"`);

    // -- Step 3: Assert ALL 6 events are still accessible (none was pruned) --
    for (const t of titles) {
      await page.goto(`${BASE_URL}/events`);
      await page.getByPlaceholder(/search events/i).fill(t);
      await expect(page).toHaveURL(/search=/, { timeout: 5000 });
      await expect(
        page.getByTestId('event-card').filter({ hasText: t }).first()
      ).toBeVisible({ timeout: 10000 });
      console.log(`Confirmed "${t}" still exists after 6th creation.`);
    }
  });

});

// ── Group 4: UI State — Admin Events Page ─────────────────────────────────────

test.describe('UI State — Admin Events Page', () => {

  // TC-504
  test('TC-504: clicking Edit pre-fills the form with existing event data', async ({ page }) => {
    await login(page);
    const title = `PreFill ${Date.now()}`;
    await createEvent(page, {
      title,
      category: 'Festival',
      city:     'Chennai',
      venue:    'Marina Beach Grounds',
      seats:    200,
      price:    75,
    });

    // -- Step 1: Navigate to admin page and click Edit on the event row --
    const row = await getAdminEventRow(page, title);
    await row.getByTestId('edit-event-btn').click();

    // -- Step 2: Assert form header switches to edit mode --
    await expect(page.getByText('✏️ Edit Event')).toBeVisible();
    await expect(page.locator('#add-event-btn')).toContainText('Update Event');

    // -- Step 3: Assert all fields are pre-populated with the original values --
    await expect(page.locator('#event-title-input')).toHaveValue(title);
    await expect(page.getByLabel('City')).toHaveValue('Chennai');
    await expect(page.getByLabel('Venue')).toHaveValue('Marina Beach Grounds');
    await expect(page.getByLabel('Price ($)')).toHaveValue('75');
    await expect(page.getByLabel('Total Seats')).toHaveValue('200');
    console.log('Edit form correctly pre-populated with existing event data.');
  });

  // TC-505
  test('TC-505: delete confirmation dialog shows correct content — Cancel preserves the event', async ({ page }) => {
    await login(page);
    const title = `DialogTest ${Date.now()}`;
    await createEvent(page, { title });

    // -- Step 1: Open the delete dialog --
    const row = await getAdminEventRow(page, title);
    await row.getByTestId('delete-event-btn').click();

    // -- Step 2: Assert dialog contents --
    await expect(page.getByText('Delete this event?')).toBeVisible();
    await expect(page.getByText(/permanently delete the event and all associated bookings/i)).toBeVisible();
    await expect(page.locator('#confirm-dialog-yes')).toContainText('Delete event');

    // -- Step 3: Dismiss the dialog via Cancel --
    await page.getByRole('button', { name: 'Cancel' }).click();

    // -- Step 4: Assert dialog closed and event is still in the table --
    await expect(page.getByText('Delete this event?')).not.toBeVisible();
    const rowAfterCancel = await getAdminEventRow(page, title);
    await expect(rowAfterCancel).toBeVisible();
    console.log(`Event "${title}" correctly preserved after dialog cancel.`);
  });

  // TC-502
  test('TC-502: static events show "Featured" badge and "Read-only" actions in admin table', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/admin/events`);
    await expect(page.getByTestId('event-table-row').first()).toBeVisible();

    // -- Step 1: Find any static event row (they appear on page 1) --
    const staticRow = page.getByTestId('event-table-row').filter({ hasText: 'Featured' }).first();
    await expect(staticRow).toBeVisible();

    // -- Step 2: Assert "Featured" badge text is in the title cell --
    await expect(staticRow.locator('span', { hasText: 'Featured' }).first()).toBeVisible();

    // -- Step 3: Assert Actions column shows "Read-only" not buttons --
    await expect(staticRow.getByText('Read-only')).toBeVisible();
  });

  // TC-503
  test('TC-503: seat count color coding — green (>10), amber (≤10), red (0)', async ({ page }) => {
    await login(page);

    const ts = Date.now();
    // Create event with 50 seats → green
    const greenTitle = `GreenSeats ${ts}`;
    // Create event with 5 seats → amber
    const amberTitle = `AmberSeats ${ts}`;

    await createEvent(page, { title: greenTitle, seats: 50 });
    await createEvent(page, { title: amberTitle, seats: 5 });

    // -- Step 1: Navigate to the admin table page where dynamic events appear --
    await page.goto(`${BASE_URL}/admin/events`);
    await expect(page.getByTestId('event-table-row').first()).toBeVisible();

    const page2Btn = page.getByRole('button', { name: '2' });
    if (await page2Btn.count() > 0) {
      await page2Btn.click();
      await expect(page.getByTestId('event-table-row').first()).toBeVisible();
    }

    // -- Step 2: Assert green seat count for 50-seat event --
    const greenRow = page.getByTestId('event-table-row').filter({ hasText: greenTitle });
    await expect(greenRow).toBeVisible();
    await expect(greenRow.locator('.text-emerald-600')).toBeVisible();
    await expect(greenRow.locator('.text-emerald-600')).toContainText('50/50');
    console.log('Green seat color confirmed for 50-seat event.');

    // -- Step 3: Assert amber seat count for 5-seat event --
    const amberRow = page.getByTestId('event-table-row').filter({ hasText: amberTitle });
    await expect(amberRow).toBeVisible();
    await expect(amberRow.locator('.text-amber-600')).toBeVisible();
    await expect(amberRow.locator('.text-amber-600')).toContainText('5/5');
    console.log('Amber seat color confirmed for 5-seat event.');
  });

});
