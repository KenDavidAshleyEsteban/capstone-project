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

## Catalog behavior

- Admins can manage every product and assign it to a registered store owner. Sellers can create and edit only products whose `storeId` matches their user ID; the API verifies the current account role from MongoDB.
- Older products may have store slugs such as `baguio-station`. An admin can edit each product and select its actual store owner to make it available in that seller's catalog. Store names are never used as proof of ownership.
- SKU values are unique. Leave the SKU blank for a new product to generate one automatically.
- Stock must be a nonnegative whole number. Automatic availability is out of stock at 0 units, low stock at 1–5, and available at 6+. Pre-order and Restock Soon can be selected explicitly.
- Upload JPG, PNG, or WebP files up to 2 MB. Uploaded photos are stored as data URLs in the product document, so details and photos save together without a separate file-storage service. Photo URLs are also supported. Removing a photo replaces it with a placeholder.
- The existing seller analytics, receipt, rewards, and offer demos remain separate from the database-backed product catalog.

## Verification

Run `npm test` in `Backend` for product validation tests. To run database integration tests too, set `TEST_MONGODB_URI` to a disposable MongoDB server. These tests create a uniquely named `gunpla_catalog_test_*` database and delete only that test database when finished. Integration coverage includes create/edit persistence, photos, duplicate SKUs, stock rules, login, registration, and cross-store access restrictions.
