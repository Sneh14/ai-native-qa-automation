import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

const BASE_URL      = 'https://eventhub.rahulshettyacademy.com';

dotenv.config();

const USER_EMAIL    = process.env.USER_EMAIL;
const USER_PASSWORD = process.env.USER_PASSWORD;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@email.com').fill(USER_EMAIL);
  await page.getByLabel('Password').fill(USER_PASSWORD);
  await page.locator('#login-btn').click();
  // Home page loads after login — "Browse Events →" link confirms successful auth
  await expect(page.getByRole('link', { name: /Browse Events/i }).first()).toBeVisible();
}

/**
 * Books the first available (non-sold-out) event on the events page.
 * Returns { bookingRef, eventTitle } from the confirmation card.
 * Precondition: user must be logged in before calling.
 */
async function bookEvent(page) {
  await page.goto(`${BASE_URL}/events`);

  // Pick the first card that has a visible "Book Now" button (not sold out)
  const firstCard = page.getByTestId('event-card').filter({
    has: page.getByTestId('book-now-btn'),
  }).first();
  await expect(firstCard).toBeVisible();

  // Capture title before navigating away
  const eventTitle = (await firstCard.locator('h3').textContent())?.trim() ?? '';
  console.log(`Booking event: "${eventTitle}"`);

  await firstCard.getByTestId('book-now-btn').click();
  await expect(page).toHaveURL(/\/events\/\d+/);

  // Fill booking form
  await page.getByLabel('Full Name').fill('Test User');
  await page.locator('#customer-email').fill('testuser@example.com');
  await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
  await page.locator('.confirm-booking-btn').click();

  // Wait for confirmation card
  const refEl = page.locator('.booking-ref').first();
  await expect(refEl).toBeVisible();
  const bookingRef = (await refEl.textContent())?.trim() ?? '';
  console.log(`Booking confirmed. Ref: ${bookingRef}`);
  return { bookingRef, eventTitle };
}

/**
 * Clears all bookings. Safe to call when already empty.
 */
async function clearBookings(page) {
  await page.goto(`${BASE_URL}/bookings`);
  const alreadyEmpty = await page.getByText('No bookings yet').isVisible().catch(() => false);
  if (alreadyEmpty) return;

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /clear all bookings/i }).click();
  await expect(page.getByText('No bookings yet')).toBeVisible();
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('Booking Management — Critical Happy Paths', () => {

  // TC-001 ───────────────────────────────────────────────────────────────────
  test('TC-001: displays booking card on bookings list page', async ({ page }) => {
    // -- Step 1: Login, clear state, create one booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef, eventTitle } = await bookEvent(page);

    // -- Step 2: Navigate to /bookings --
    await page.goto(`${BASE_URL}/bookings`);

    // -- Step 3: Assert booking card appears with correct data --
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await expect(card).toBeVisible();
    await expect(card).toContainText(eventTitle);
    await expect(card).toContainText('confirmed');
    await expect(card).toContainText(bookingRef);
  });

  // TC-002 ───────────────────────────────────────────────────────────────────
  test('TC-002: shows all sections on booking detail page', async ({ page }) => {
    // -- Step 1: Login, clear state, create one booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef, eventTitle } = await bookEvent(page);

    // -- Step 2: Navigate to /bookings and click View Details --
    await page.goto(`${BASE_URL}/bookings`);
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await card.getByRole('link', { name: 'View Details' }).click();
    await expect(page).toHaveURL(/\/bookings\/\d+/);

    // -- Step 3: Verify breadcrumb shows booking ref --
    await expect(page.locator('span.font-mono.font-bold').first()).toContainText(bookingRef);

    // -- Step 4: Verify event details section --
    await expect(page.getByText('Event Details')).toBeVisible();
    await expect(page.getByText(eventTitle).first()).toBeVisible();

    // -- Step 5: Verify customer details section --
    await expect(page.getByText('Customer Details')).toBeVisible();
    await expect(page.getByText('Test User')).toBeVisible();

    // -- Step 6: Verify payment summary section --
    await expect(page.getByText('Payment Summary')).toBeVisible();
    await expect(page.getByText('Total Paid')).toBeVisible();

    // -- Step 7: Verify refund eligibility check button is present --
    await expect(page.locator('#check-refund-btn')).toBeVisible();
  });

  // TC-006 ───────────────────────────────────────────────────────────────────
  test('TC-006: navigates to bookings list after booking via View My Bookings link', async ({ page }) => {
    // -- Step 1: Login and clear state --
    await login(page);
    await clearBookings(page);

    // -- Step 2: Book the first available event --
    await page.goto(`${BASE_URL}/events`);
    const firstCard = page.getByTestId('event-card').filter({
      has: page.getByTestId('book-now-btn'),
    }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByTestId('book-now-btn').click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    await page.getByLabel('Full Name').fill('Test User');
    await page.locator('#customer-email').fill('testuser@example.com');
    await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
    await page.locator('.confirm-booking-btn').click();

    // -- Step 3: Confirm booking ref appears on confirmation card --
    const refEl = page.locator('.booking-ref').first();
    await expect(refEl).toBeVisible();
    const bookingRef = (await refEl.textContent())?.trim() ?? '';
    console.log(`Booking confirmed. Ref: ${bookingRef}`);

    // -- Step 4: Click "View My Bookings" link on confirmation card --
    await page.getByRole('link', { name: 'View My Bookings' }).click();
    await expect(page).toHaveURL(`${BASE_URL}/bookings`);

    // -- Step 5: Assert the new booking appears in the list --
    const bookingCard = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await expect(bookingCard).toBeVisible();
  });

  // TC-102 ───────────────────────────────────────────────────────────────────
  test('TC-102: booking reference starts with first letter of event title (uppercase)', async ({ page }) => {
    // -- Step 1: Login and clear state --
    await login(page);
    await clearBookings(page);

    // -- Step 2: Book first available event and capture title --
    const { bookingRef, eventTitle } = await bookEvent(page);

    // -- Step 3: Assert ref starts with the event title's first char --
    const expectedPrefix = eventTitle[0].toUpperCase();
    expect(bookingRef).toMatch(new RegExp(`^${expectedPrefix}-[A-Z0-9]{6}$`));
    console.log(`Ref "${bookingRef}" correctly starts with "${expectedPrefix}-" (event: "${eventTitle}")`);
  });

  // TC-003 + TC-506 ──────────────────────────────────────────────────────────
  test('TC-003: cancels booking from detail page — shows toast and redirects', async ({ page }) => {
    // -- Step 1: Login, clear state, create one booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef } = await bookEvent(page);

    // -- Step 2: Navigate to booking detail via View Details --
    await page.goto(`${BASE_URL}/bookings`);
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await card.getByRole('link', { name: 'View Details' }).click();
    await expect(page).toHaveURL(/\/bookings\/\d+/);

    // -- Step 3: Click Cancel Booking button on detail page --
    await page.getByRole('button', { name: 'Cancel Booking' }).click();

    // -- Step 4: Assert React confirmation dialog appears --
    await expect(page.getByText('Cancel this booking?')).toBeVisible();
    await expect(page.locator('#confirm-dialog-yes')).toBeVisible();

    // -- Step 5: Confirm cancellation --
    await page.locator('#confirm-dialog-yes').click();

    // -- Step 6: Assert redirect to /bookings and success toast --
    await expect(page).toHaveURL(`${BASE_URL}/bookings`);
    await expect(page.getByText('Booking cancelled successfully')).toBeVisible();

    // -- Step 7: Assert booking is no longer in the list --
    await expect(page.getByText('No bookings yet')).toBeVisible();
  });

  // TC-004 ───────────────────────────────────────────────────────────────────
  test('TC-004: clears all bookings and shows empty state', async ({ page }) => {
    // -- Step 1: Login, clear state, create one booking --
    await login(page);
    await clearBookings(page);
    await bookEvent(page);

    // -- Step 2: Navigate to /bookings and verify booking exists --
    await page.goto(`${BASE_URL}/bookings`);
    await expect(page.getByTestId('booking-card').first()).toBeVisible();

    // -- Step 3: Click "Clear all bookings" and accept browser confirm dialog --
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /clear all bookings/i }).click();

    // -- Step 4: Assert empty state --
    await expect(page.getByText('No bookings yet')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Browse Events' })).toBeVisible();
  });

});
