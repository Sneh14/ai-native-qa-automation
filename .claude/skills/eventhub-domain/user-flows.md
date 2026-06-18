# EventHub User Flows & Test Data

## Flow 1: Registration & Login
1. Navigate to /register
2. Enter email (must be unique) and password (min 6 chars)
3. Submit -> JWT issued -> redirected to home
4. Or: Navigate to /login -> enter credentials -> JWT issued -> home

## Flow 2: Browse & Filter Events
1. Login -> navigate to /events
2. Use search bar (searches title, description, venue)
3. Filter by category dropdown (Conference, Concert, etc.)
4. Filter by city dropdown (Bangalore, Mumbai, etc.)
5. Paginate (12 events per page)
6. Click "Book Now" on any event card

## Flow 3: Book an Event
1. From event card -> click "Book Now" -> navigate to /events/:id
2. See event details (title, date, venue, price, available seats)
3. Select quantity (1-10) using +/- buttons
4. Fill customer form: name, email, phone
5. Click "Confirm Booking"
6. See confirmation card with booking reference
7. Navigate to "View My Bookings" or "Browse Events"

## Flow 4: Manage Bookings
1. Navigate to /bookings
2. See list of all bookings with details
3. Click "View Details" -> /bookings/:id
4. See full booking info + event details
5. Check refund eligibility (spinner + result)
6. Cancel booking (delete)
7. Or: "Clear all bookings" from bookings list

## Flow 5: Admin - Manage Events
1. Navigate to /admin/events
2. Fill event creation form (title, category, city, venue, date, price, seats)
3. Submit -> "Event created!" toast
4. See list of user-created events
5. Edit existing events (update form)
6. Delete events (with cascade to bookings)

## Flow 6: Cross-User Security
1. User A creates a booking
2. User A captures booking ID
3. Switch to User B (clear localStorage, re-login)
4. User B navigates to /bookings/:userA_booking_id
5. Sees "Access Denied" message

---

## Test Data

### Seeded Data (10 Static Events)
Run `npm run seed` to insert:
- Tech Conference Bangalore (Conference, 500 seats, $1499)
- Bollywood Night Mumbai (Concert, 1000 seats, $999)
- IPL Cricket Finals (Sports, 40000 seats, $2499)
- Digital Marketing Workshop (Workshop, 100 seats, $299)
- Holi Festival Delhi (Festival, 5000 seats, $199)
- AI Summit Hyderabad (Conference, 300 seats, $1999)
- Classical Music Evening (Concert, 200 seats, $799)
- Marathon Chennai (Sports, 10000 seats, $49)
- Photography Workshop (Workshop, 50 seats, $399)
- Food Festival Bangalore (Festival, 2000 seats, $149)

### Test Accounts
Read `./config.md`
