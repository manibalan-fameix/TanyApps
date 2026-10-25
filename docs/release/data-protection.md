# Data protection: what exists, what a launch needs, what can wait

Written for the person who will answer a data request or an auditor. The database facts below were read from the live schema's catalog on a
migrated database (`0000`-`0032`); they are not recalled from memory. **Anything about what the law requires is for your lawyer to confirm**
(India's DPDP Act and Rules, and the tax and accounting record-keeping rules that apply to your businesses, which may require keeping some records).

## 1. What the database does today

| Fact (verified in the catalog) | Consequence |
|---|---|
| 36 tables carry a foreign key to `dealers`; 32 of them `CASCADE`. **`audit_log`, `bookings`, `cars` and `leads` do not** (`NO ACTION`). | `DELETE FROM dealers` **fails** for any business that has cars, bookings, leads or audit entries. There is no one-statement erasure. |
| `audit_log` and `price_events` are **append-only by trigger** (UPDATE, DELETE and TRUNCATE are refused). | They cannot be deleted or edited, by design. Anything personal in them must never have been written (see below). |
| `price_events -> cars` and `rc_transfers -> cars` are `NO ACTION`. | A car with history is archived, never deleted (the app already does this). |
| `trips -> customers` is `NO ACTION`, but `customers -> dealers` and `trips -> dealers` cascade. | Deleting a whole business in one statement works for the cab tables; deleting one customer who has trips does not. |
| Personal fields are encrypted (AES-256-GCM, one key) or hashed (blind index); the audit log redacts personal keys (`phone`, `email`, `address`, `lat`, `lng`, `token`, `hash`, ...). | Backups and logs hold ciphertext, not plaintext. Losing the key loses the data; see section 4. |
| Payment data is only Razorpay ids and amounts; card details never touch us. | Financial rows can be kept without personal data once the name and phone are removed. |
| After this release: failed-query messages are sanitised before logging; payment exceptions hold ids and plain descriptions only. | Logs and the exception table do not hold personal data. |

## 2. Launch controls (mandatory before real customers' data is processed at scale)

| Control | Status | Evidence / action |
|---|---|---|
| Privacy notice that names the processors and a contact for requests | **Exists** | `app/privacy/page.tsx` (Cloudflare, Neon, Google/Meta sign-in, Google Gemini); review wording with counsel |
| A named person who answers requests, within a stated time | **Missing** | Decide the owner; put the contact in the notice |
| Export a person's data on request | **Manual procedure below** | Not self-service |
| Erase or anonymise a person's data on request | **Manual procedure below** | Not self-service; has an unavoidable record-retention carve-out |
| Consent recorded for the data we collect | **Partial** | Motors leads carry `consent_at`; cabs and eats store the data needed to fulfil the order, which is a different basis: confirm with counsel |
| Breach response | **Missing** | One page: who decides, who is told, the regulator and affected people, within the legal time |
| Encryption at rest and in transit | **Yes** | AES-256-GCM for personal fields; TLS everywhere; Neon encrypts storage **[verify in Neon's documentation]** |
| Access limited to those who need it | **Yes** | tenant scoping; owner/staff roles; refunds owner-only (this release); Tany team allow-list |
| Backups and restore | **Documented, not rehearsed** | `PRODUCTION-RELEASE.md` section 8; rehearse once |

## 3. Manual procedures (run by a named person, in a transaction, after a backup; none has been run against production)

**Export one customer's data (Eats / Cabs).** Customers are per business: the same phone at two businesses is two customers. Find the customer by
the phone's blind index, in the business they asked about, then read their rows (`customers`, `customer_addresses`, `customer_contacts`, `customer_identities`,
`trips`/`orders` and their events), decrypt the encrypted fields with the application's key, and hand the result over. Use the application's own
`phoneHash()` to compute the lookup value; do not write the hash by hand.

**Anonymise (erase) one customer.** In one transaction, for that customer in that business: overwrite `name`, `phone_enc`, `email_enc`, address rows and
`notes_enc` with empty or placeholder values, set `phone_hash` to a random value (so the unique index stays satisfied and the person cannot be found again),
delete `customer_addresses`, `customer_contacts` and `customer_identities`, and null the order's name, phone and address. **Keep** the amounts, ids and
timestamps: they are financial records (confirm the retention period with counsel). Do not touch `audit_log`.

**Close a business (tenant).** The dealer row stays; its personal data does not. In one transaction: archive all cars; anonymise every customer, lead
and booking buyer as above; delete menu, media rows and team users; set `dealers.status`/plan to closed (a column or a flag as appropriate) and remove the
custom domain; then delete the business's files from R2 (`dealers/<id>/` for public media, and the private-documents bucket's prefix). Record who did it
and when. A real `DELETE FROM dealers` is possible only for a business that never had cars, bookings, leads or audit entries (test accounts).

**R2 media.** Deleting a database row does not delete the object. List by prefix (`dealers/<id>/`) and delete, then verify the listing is empty.
Walkaround videos' HLS outputs live next to the original (`videoOutputKeys`).

## 4. Encryption key

One key (`ENCRYPTION_KEY`) for every business; ciphertext carries a version tag (`v1`) but no key id; blind indexes use a second key (`BLIND_INDEX_KEY`).

- **Do not rotate in one pass.** A rotation means decrypting and re-encrypting every personal field in every table, and recomputing every blind index that sits behind a unique index (`customers_dealer_phone_uq`, `drivers_dealer_phone_uq`, ...). A mistake corrupts data that cannot be recovered without the old key.
- **Before the first rotation is ever needed (small, safe, do soon):** keep the key in two secret stores outside the repository and test that a restored backup decrypts with it; add a key id to the ciphertext prefix (`v2:<kid>:...`) so old and new values can coexist; make `decrypt` accept both.
- **When rotating:** introduce the new key for new writes first; re-encrypt in batches per business, each batch in a transaction, verifying a sample; retire the old key only after a full pass and a restore test.

## 5. Retention (proposal; confirm before publishing)

| Data | Keep | Reason / note |
|---|---|---|
| Bookings, orders, refunds, payment ids and amounts | the period tax and accounting law requires **[counsel]** | financial record; personal fields removed on request |
| Customer profile, addresses, contacts | until the customer asks, or the business closes | needed to serve them |
| Notification outbox | **no retention policy exists**; propose 90 days after delivery | currently grows without limit |
| Audit log | the period you set; it is append-only, so decide before it is large | holds no personal data (redacted) |
| `payment_exceptions` | resolved entries for 2 years | ids and descriptions only |
| Backups | the Neon restore window **[verify]** | erased data remains in a backup until it ages out; say so in the notice |
| R2 media | until the car/business is closed, then deleted | |

## 6. Deferred, with the reason

| Item | Why it can wait |
|---|---|
| Self-service export and erasure in the product | Few businesses at launch; the manual procedure above is enough for the first requests. Build it once a request is slow to serve. |
| Key rotation tooling | Not needed until a key is suspected exposed; the safe prerequisite (key id) is small and listed above. |
| Notification retention job | Storage cost only, not a legal blocker at launch volume; schedule it before the outbox is large. |
| Automatic anonymisation on business closure | Closures are rare; do them by hand with the procedure. |
| India data residency | Staging is in `us-east-2`, the other Neon project in `ap-southeast-1`. Whether the Act requires data to stay in India for your data is for counsel; if it does, move the production database to an Indian region **[verify Neon regions]**. |
