# Gunpla Hub

Store owners and admins can manage products at `/admin-dashboard.html`. The catalog supports adding and editing kits, price and stock changes, photo uploads or URLs, search, filters, and pagination. Products and uploaded photos are saved in MongoDB and loaded by the public home and discovery pages.

## Run locally

1. Install Node.js 20.19 or newer and have a local MongoDB instance or MongoDB Atlas connection ready.
2. In `Backend`, run `npm ci`.
3. Copy `Backend/.env.example` to `Backend/.env`. Set `MONGODB_URI` and a long random `JWT_SECRET`.
4. Run `npm start` from `Backend`.
5. Open `http://localhost:5000/login.html`. Register a seller account with a store name and location, or sign in with an existing admin. Both roles can open the product dashboard after login.

To create the first admin, set `ADMIN_EMAIL`, `ADMIN_USERNAME`, and a strong `ADMIN_PASSWORD` in `.env`, then run `npm run seed:admin`. This does not replace an existing admin or reset its password. Remove the seeding password from `.env` afterward. The old seed script included a database credential in source control; rotate that credential if it is still active.

The backend serves the frontend and API together. VS Code Live Server on ports 5500/5501 is also supported with the API running on port 5000. For a different API host, set `window.GUNPLA_API_URL` before loading the frontend scripts.

All frontend pages share `Frontend/images/Wallpaper23.jpg` as their background through `css/base.css`. The fixed decorative layer uses `background-size: cover` to fill desktop and phone viewports without stretching or tiling. Portrait screens position the image at 68% horizontally to keep the Gundam visible; a dark overlay keeps content readable. The previous Galaxy animation is no longer loaded.

## Catalog behavior

- Admins can manage every product and assign it to a registered store owner. Sellers can create and edit only products whose `storeId` matches their user ID; the API verifies the current account role from MongoDB.
- Older products may have store slugs such as `baguio-station`. An admin can edit each product and select its actual store owner to make it available in that seller's catalog. Store names are never used as proof of ownership.
- SKU values are unique. Leave the SKU blank for a new product to generate one automatically.
- Stock must be a nonnegative whole number. Automatic availability is out of stock at 0 units, low stock at 1–5, and available at 6+. Pre-order and Restock Soon can be selected explicitly.
- Upload JPG, PNG, or WebP files up to 2 MB. Uploaded photos are stored as data URLs in the product document, so details and photos save together without a separate file-storage service. Photo URLs are also supported. Removing a photo replaces it with a placeholder.
- Sales and product inventory are database-backed. Buyer reservations, rewards, QR point claims, and offer availability still use browser demo data; they are not imported as completed sales.

## Automatic stock monitoring

The home page, discovery catalog, product dashboard, and seller dashboard poll the database every 15 seconds while visible. The lightweight `/api/products/stock` and authenticated `/api/admin/stock` responses omit product photos. Seller snapshots are scoped to the signed-in owner; admins can monitor all catalog stock. Each page shows the last successful check, supports **Check stock now**, and displays offline, retry, paused, or sign-in-required states without clearing the last known stock.

The seller dashboard updates unit totals, low/zero-stock alerts, stock rows, stock health, and prediction stock coverage without replacing the sale draft or forecast selections. Product editors and unsaved stock-row edits pause checks; **Reset** discards a stock-row draft and resumes synchronization. Discovery keeps search and grade/skill filters. Hidden tabs pause and resume when visible. Requests do not overlap, and failed requests retry on the next interval. Product updates include the version originally edited, so a newer sale or inventory update produces a conflict instead of being overwritten.

## Recording sales

In **Seller dashboard → Record a sale**, choose the product, quantity, unit price, and sale date, then save the completed sale. The API verifies store ownership, stores an itemized receipt in MongoDB, and refreshes revenue, product-demand signals, sales history, and predictions. The overview, sales form history, and predictions cover the last 28 days and exclude seed/demo receipts and reservations. Recording an offer sale also saves its revenue through this API; offer availability itself remains local.

**Receipt revenue** supports Daily, Weekly, and Monthly grouping with Last 28 days, Last 90 days, and Last 365 days history ranges. Totals and receipt counts use only the signed-in store's completed database sales, including offer sales. Philippine sale dates define the calendar day, weeks run Monday–Sunday, and months are grouped by calendar year and month. Zero-sales days remain visible; boundary weeks/months count only dates within the selected range. Controls preserve the sale draft and retain their selection when a sale refreshes the dashboard. The seller page requests up to 366 days of authenticated sales history, while the other overview panels still use 28 days.

**Deduct quantity from current stock** saves the receipt and stock change in one transaction, prevents overselling, and updates availability. This needs MongoDB Atlas or a MongoDB replica set. For sales whose stock changes were already recorded, or a standalone development database, clear that checkbox to save the sale without changing stock. Historical dates clear it automatically. Request IDs prevent unchanged retries from recording or deducting the same sale twice.

## Seller predictions

Open `seller-dashboard.html#sellerPredictions` as a seller to predict revenue, kit demand, days of stock remaining, and reorder quantities for the next 7, 14, or 30 days. The forecast extends the last seven calendar days' daily average, including days with no sales. It needs receipts on at least three days across seven calendar days within the last 28 days. The chart distinguishes historical revenue from predicted revenue; the panel explains the method and limited-history cases.

Forecasts use only the signed-in store's completed database receipts with a matching `storeId` and a `source` of `sale` or `seller-offer`. Itemized kit quantities use `lineItems: [{ productId, quantity }]` matched to catalog SKUs or database IDs. Receipts without item details can support revenue estimates but cannot support kit stock estimates. Simulated kit sales are excluded. **Demo preview** generates a separate sample history without saving it or changing stock. Product management uses the shared dark theme, warm accents, and wallpaper background.

## Visual beginner guide

The guide includes a proportional scale comparison, an interactive six-grade explorer, and illustrated clipping/cleanup steps. Heights use an explicitly labeled 18 m reference mobile suit rather than claiming every kit has the same size. The SVG diagrams and controls use the existing theme, support small screens and keyboard interaction, and link to BANDAI's grade overview and building instructions.

## Community event details

The Events page includes search and event-type filters. Each listing shows a full date, start/end time in Philippine time, venue/address and directions, and admission fee. Expand **View full event details** for activities, what to bring, included materials, audience, capacity, registration deadline/link, accessibility, organizer contacts, rules, and cancellation/refund policy.

Events and RSVPs are stored in MongoDB. On first startup, the server initializes an empty events collection with the unconfirmed samples in `Backend/data/sampleEvents.json`; subsequent startups preserve admin edits. The Events page loads `/api/events` and shows an error/retry state if the API cannot be reached. Existing browser-only event interests are not imported as reservations.

Sign in as an admin and open **Events → Add event** or **Edit event** to manage all event details. Confirmed events require a date, start/end times in Philippine time, venue/address, organizer, PHP admission fee (`0` for free), and capacity (1–10,000). Missing sample details display **To be announced**, and sample/cancelled/past events cannot accept new RSVPs. An optional registration deadline closes at the end of that Philippine calendar day; booking always closes when the event starts. Admins can view attendee usernames and RSVP timestamps. Event edits use a revision check and cannot reduce capacity below the current RSVP count.

Buyers and sellers use **RSVP · Going** to reserve one seat or **Cancel RSVP** to release it. The server verifies the current account from the database, saves one RSVP per account per event, checks deadlines and available seats, and prevents concurrent requests from overbooking. Repeating the same action is safe, including after a lost response. Reservations survive reloads and sign-ins on other devices. Public responses include attendance totals and only the current account's RSVP; attendee identities are available only to admins. These atomic event updates work on standalone MongoDB as well as replica sets. Any admission fee or additional registration requirement is arranged directly with the organizer.

## Build video uploads and admin review

Buyers and sellers submit MP4, WebM, or Ogg files up to 100 MB from the beginner guide. The uploader shows transfer progress, then reports **Pending admin review** after the server finishes saving and validating the file. **My uploads** shows the filename, uploader, submission date, size, current status, and review notes. Videos and metadata are stored centrally in MongoDB/GridFS rather than only in the browser. Existing browser-only videos must be submitted again; they are not automatically published.

Admins open **Product dashboard → Review build videos** (`/video-review.html`) to filter uploads by status, preview private submissions, and approve or reject them. Rejections require a reason. Each decision records the reviewer, time, note, and an audit-history entry. Only approved videos and their content are public. An owner can withdraw a video, and an admin can reject a previously approved video to unpublish it. Authenticated previews stay private; public playback supports byte ranges. File type/size checks and upload failures are enforced on the server. No external file-storage key is needed.

Restart the backend after pulling these changes: `server.js` now runs the same Express application used by the tests, including the sales, events/RSVP, and video routes, initial sample-event setup, and frontend assets.

## Verification

The public Stores page (`/store.html`) includes a searchable Leaflet map with OpenStreetMap tiles, shop-area popups, Google Maps directions, and nearby Street View links. Search filters the cards and pins together; **Show all stores** clears the search and resets the map. Baguio Gundams Hobby Shop is listed at Stall 2|2, Maharlika Bldg., Baguio City; its pin and navigation links use the Maharlika Livelihood Complex building location. The coordinates in `Frontend/js/data.js` are approximate building/street/neighborhood centers looked up with OpenStreetMap/Nominatim, not verified storefront entrances. The optional `mapLocation` field supplies a searchable building address while `location` keeps the full displayed stall address. Leaflet 1.9.4, its CSS, marker images, and BSD license are bundled in `Frontend/vendor/leaflet`, so the library does not depend on a CDN or API key. Map tiles require internet access and show OpenStreetMap attribution; map and directions links remain usable if tiles cannot load. Street View opens Google Maps and depends on nearby imagery coverage. See the [Leaflet setup guide](https://leafletjs.com/examples/quick-start/), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), and [Google Maps URL documentation](https://developers.google.com/maps/documentation/urls/get-started).

Run `npm test` in `Backend` for product validation, revenue grouping, forecast calculation, RSVP time boundaries, and stock-monitor lifecycle tests. To run database integration tests too, set `TEST_MONGODB_URI` to a disposable MongoDB replica set. These tests create uniquely named `gunpla_catalog_test_*`, `gunpla_workflow_test_*`, and `gunpla_events_test_*` databases and delete only those test databases when finished. Integration coverage includes product persistence and permissions, sale retries and concurrent overselling, store-specific analytics data, event validation and admin permissions, RSVP persistence/retries/cancellation, simultaneous seat limits, deadlines, attendee privacy, upload validation, private previews, approval/rejection, review history, byte-range playback, and video withdrawal. Email delivery is stubbed during tests.
