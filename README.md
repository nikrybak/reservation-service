# reservation-service

Seat reservation for ticketed events, built with NestJS and TypeScript. Customers place a
time-limited **hold** on specific seats, then **confirm** it into a booking with an
idempotency key. Holds expire on their own and the seats go back on sale. Two customers
can never book the same seat, even when their requests arrive at the same moment.

The service is small, but it deals with the problems real ticketing systems have: races for
the same seat, retried requests, state that changes with time, and side effects that must
not be lost.

## Features

- Events with a seat map (sections, rows, seats) and pricing tiers. Money is stored as
  integer minor units.
- Holds with a configurable TTL and seat limit. A scheduled sweep expires them, and a lapsed
  hold stops protecting its seats even before the sweep runs.
- Confirmation is idempotent: a repeated `Idempotency-Key` returns the original booking, and
  the same key on a different hold is rejected.
- Optimistic concurrency with a `version` column on every row that can be contended.
- Transactional outbox for `SeatsHeld`, `HoldReleased`, `HoldExpired`, `BookingConfirmed`
  and `BookingCancelled`. A dispatcher delivers the events with exponential backoff and
  moves a message to a dead letter after the last attempt.
- Cached availability snapshot that committed domain events invalidate.
- API-key authentication, role-based authorization, RFC 9457 `problem+json` errors,
  correlation ids and structured pino logs.
- PostgreSQL through Kysely with plain SQL migrations, and an in-memory adapter with the same
  semantics for fast tests.

## API

All endpoints except `/health` need an `x-api-key` header. Keys map to a role (`admin` or
`client`) and a principal id.

| Method   | Path                       | Role  | Description                                         |
| -------- | -------------------------- | ----- | --------------------------------------------------- |
| `POST`   | `/events`                  | admin | Create an event with its seat map and pricing tiers |
| `GET`    | `/events/:id/availability` | any   | Seat map with per-seat status (cached)              |
| `POST`   | `/events/:id/holds`        | any   | Hold seats for `ttlSeconds` (optional)              |
| `DELETE` | `/holds/:id`               | owner | Release a hold                                      |
| `POST`   | `/holds/:id/confirm`       | owner | Confirm a hold; requires `Idempotency-Key`          |
| `GET`    | `/bookings/:id`            | owner | Fetch a booking                                     |
| `POST`   | `/bookings/:id/cancel`     | admin | Cancel a booking and free its seats                 |
| `GET`    | `/health`                  | none  | Liveness and database check                         |

"owner" means the principal that placed the hold. Admins can also read and release other
principals' holds and bookings. Anyone else gets a 404, so ids cannot be probed.

Errors always look like this:

```json
{
  "type": "https://reservation-service.example/problems/seats_unavailable",
  "title": "Conflict",
  "status": 409,
  "code": "seats_unavailable",
  "detail": "Some seats are no longer available",
  "instance": "/events/0b6f.../holds",
  "correlationId": "4f1c...",
  "context": { "seatIds": ["A-1-4"] }
}
```

| Status | Meaning                                                                                |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | Malformed request: DTO validation, bad UUID, missing `Idempotency-Key` (`errors[]`)    |
| 401    | Missing or unknown API key                                                             |
| 403    | Role not allowed                                                                       |
| 404    | Unknown resource, or one that belongs to someone else                                  |
| 409    | State conflict: seat taken, hold no longer active, booking already cancelled           |
| 410    | Hold expired                                                                           |
| 422    | Well-formed request that breaks a business rule (seat map, TTL, seat limit, key reuse) |

## Architecture

```
src/
  modules/
    events/      seat map, seat inventory, availability snapshot and cache
    holds/       place, release and expire holds; expiry scheduler
    bookings/    confirm holds into bookings, cancel, read
    health/
  shared/
    domain/      Money, DomainError, DomainEvent, AggregateRoot
    application/ UnitOfWork, ports (Clock, TransactionManager, OutboxRepository)
    persistence/ in-memory store, Kysely database, migration runner
    outbox/      dispatcher, subscribers, poller
    http/        problem+json filter, validation pipe, correlation id, logging interceptor
    auth/        API-key guard, roles guard, decorators
    config/      zod-validated environment
migrations/      plain SQL, applied in lexical order
```

Each feature module is a vertical slice with the same four layers, and dependencies only
point inwards:

```
http/            controllers and DTOs: transport only, no business rules
  -> application/   use cases; open the unit of work, call the domain, persist
    -> domain/        entities, value objects, invariants; no framework imports
  infrastructure/   repository adapters (Kysely, in-memory), schedulers
```

- **Domain** classes (`TicketedEvent`, `Seat`, `Hold`, `Booking`, `Money`, `SeatId`,
  `IdempotencyKey`) enforce their own invariants and throw typed `DomainError`s. An ESLint
  rule fails the build if a domain file imports NestJS, Kysely or class-validator.
- **Use cases** depend on repository ports (`HoldRepository`, `SeatRepository`, ...) that
  are bound by injection token. `repositoryProvider()` picks the Kysely or in-memory adapter
  from `PERSISTENCE_DRIVER`, so every test runs the production use cases unchanged.
- **Controllers** map request DTOs to commands and domain objects to response DTOs. Entities
  never leave the application layer.
- **Errors**: domain errors carry a `kind` (`validation`, `not_found`, `conflict`, `gone`,
  `forbidden`). One global filter maps the kind to an HTTP status, so the domain never
  mentions HTTP.

## Design decisions

### Concurrency control: optimistic, per seat

Every `seats`, `holds` and `bookings` row has a `version` column. Repositories update with
`WHERE version = :loaded` and treat zero affected rows as a `ConcurrencyConflictError`,
which rolls back the whole unit of work.

Why optimistic locking instead of `SELECT ... FOR UPDATE`:

- **The loser cannot win on retry.** If two customers want seat A-1-4, the second one
  should get an immediate 409 and pick another seat. Waiting on a row lock only to fail
  afterwards adds latency and holds a connection.
- **Locks never span application code.** Nothing is locked while the use case runs domain
  logic. In PostgreSQL the competing `UPDATE` blocks only for the few microseconds until the
  first transaction commits, then re-evaluates the version predicate and matches no row.
- **The consistency boundary is the seat, not the event.** Customers buying different seats
  of the same event never conflict. A version on the event row would serialize every sale
  of a popular show.
- **The in-memory adapter can copy it exactly.** Its unit of work stages writes and checks
  every version and unique key in one synchronous commit, so the concurrency e2e tests
  exercise the same rule production relies on.

A version conflict while placing a hold is reported as `seats_unavailable`, which is what
it means to the client. The `bookings` table also has unique constraints on `hold_id` and
`(holder_id, idempotency_key)` as a second line of defence.

### Hold expiry

Each hold stores `expires_at`, and each held seat stores `held_until`. Expiry is enforced
in three places, each for its own reason:

1. **Confirmation** checks the deadline in the domain (`Hold.confirm`) and returns
   `410 Gone` even if the sweep has not run yet. Correctness never depends on the scheduler.
2. **Placing a hold** treats a seat whose `held_until` has passed as available. A lapsed
   hold therefore never blocks a sale. If it is taken over, the old hold's later release
   skips that seat because the seat no longer carries its `hold_id`.
3. **The sweep** (`HoldExpiryScheduler`, `HOLD_SWEEP_INTERVAL_MS`) marks due holds
   `expired`, frees their seats and emits `HoldExpired`. Each hold expires in its own
   transaction, so a hold that the customer confirms at the same moment causes a version
   conflict that the sweep skips, and never a lost booking. A partial index on
   `holds (expires_at) WHERE status = 'active'` keeps the scan cheap.

The interval is registered through `SchedulerRegistry` instead of `@Interval()`. That way
the period comes from validated config, and tests can switch the sweep off and drive it
with a fake clock.

### Transactional outbox

`UnitOfWork.execute()` runs a use case in a transaction. Aggregates record domain events,
and the unit of work appends them to the `outbox` table **in the same transaction** as the
state change. An event is never published for a change that was rolled back, and no
committed change loses its event.

`OutboxDispatcher` claims due messages with
`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *` and sets a lease
(`locked_until`). Several instances can therefore dispatch in parallel without taking the
same message, and a crashed dispatcher's batch becomes due again when its lease expires.
Failed deliveries are retried with exponential backoff
(`OUTBOX_RETRY_BASE_DELAY_MS * 2^(attempt-1)`, capped at five minutes). After
`OUTBOX_MAX_ATTEMPTS` the message is dead-lettered (`dead_at`, `last_error`) instead of
blocking the queue. Delivery is at least once, so subscribers must be idempotent. The
included subscriber writes each event as a structured log line, where a broker publisher
would go.

### Availability cache

`GET /events/:id/availability` is the hottest read and changes only when a domain event
happens. The snapshot is cached in process and invalidated by the same events the outbox
carries. After a unit of work commits, `CommittedEventsBus` notifies in-process listeners,
and the cache drops the affected event.

A slow reader could build a snapshot from pre-commit data and store it after the
invalidation. To prevent that, every event key has a generation counter: a reader takes a
ticket before loading, and `set()` stores the snapshot only if the generation has not
changed. The response carries `x-cache: hit|miss`.

With several instances you would move invalidation onto the outbox path, through a broker
fan-out or a shared cache, because the commit hook is process-local. The `EventSubscriber`
interface already supports that.

### Other choices

- **Money** is an integer amount of minor units plus an ISO 4217 code. Mixing currencies
  throws an error, and BIGINT columns are converted back to numbers with a safe-integer
  check.
- **Config** is parsed once at startup with zod. An invalid environment stops the process
  with a list of every problem. `AppModule.register(config)` takes the parsed config, so
  tests never touch `process.env`.
- **API keys** are compared as SHA-256 digests with `timingSafeEqual`, and every configured
  key is checked so the response time does not depend on which key matched.
- **Kysely** instead of an ORM: typed SQL, no code generation and no binary engine. A small
  runner applies the SQL migrations.

## Running

Requirements: Node.js 22 or newer. PostgreSQL 15 or newer is needed only for the
`postgres` driver.

```bash
npm ci
cp .env.example .env    # then edit API_KEYS
```

**Without a database** (in-memory, state is lost on restart):

```bash
npm run build
PERSISTENCE_DRIVER=memory API_KEYS=dev-admin-key-change-me:admin:ops,dev-client-key-change-me:client:web-shop npm start
```

**With PostgreSQL in Docker:**

```bash
docker compose up --build
```

Compose starts PostgreSQL, runs the migrations once and then starts the API on port 3000.
To run the API on the host against the compose database:

```bash
docker compose up -d postgres
npm run build
DATABASE_URL=postgres://reservation:reservation@localhost:5432/reservation npm run migrate
npm run start:dev
```

### Configuration

| Variable                     | Default    | Purpose                                       |
| ---------------------------- | ---------- | --------------------------------------------- |
| `PERSISTENCE_DRIVER`         | `postgres` | `postgres` or `memory`                        |
| `DATABASE_URL`               |            | Required for `postgres`                       |
| `API_KEYS`                   |            | `key:role:principalId,...`, keys of 16+ chars |
| `HOLD_DEFAULT_TTL_SECONDS`   | `600`      | TTL when the request does not set one         |
| `HOLD_MAX_TTL_SECONDS`       | `1800`     | Upper bound for `ttlSeconds`                  |
| `HOLD_MAX_SEATS`             | `10`       | Seats per hold                                |
| `HOLD_SWEEP_INTERVAL_MS`     | `5000`     | Expiry sweep period, `0` disables it          |
| `OUTBOX_POLL_INTERVAL_MS`    | `1000`     | Dispatcher period, `0` disables it            |
| `OUTBOX_MAX_ATTEMPTS`        | `8`        | Attempts before a message is dead-lettered    |
| `OUTBOX_RETRY_BASE_DELAY_MS` | `500`      | First retry delay, doubled on each attempt    |
| `LOG_LEVEL`                  | `info`     | pino level                                    |

## Testing

```bash
npm run lint        # ESLint (type-aware) + Prettier check
npm run typecheck   # tsc --noEmit over src and test
npm test            # unit tests
npm run test:e2e    # HTTP tests against the in-memory adapter
```

- **Unit tests** cover the domain invariants (seat map validation, seat state machine,
  hold TTL and deadlines, booking cancellation, value objects), the use cases wired by hand
  to the in-memory adapters (atomic holds, eight concurrent requests for one seat,
  idempotent and concurrent confirmation, key reuse, expired and foreign holds), the
  in-memory store's optimistic commit, outbox retries and dead-lettering, the cache
  generation guard and config parsing.
- **End-to-end tests** boot the real `AppModule` with a fake clock and send real HTTP
  requests through supertest: the hold -> confirm -> booking flow with cache invalidation
  and outbox contents, idempotent replay, five concurrent holds on one seat (exactly one
  `201`), expiry (`410` before the sweep, seats freed after it), takeover of a lapsed hold,
  release, admin cancellation, validation errors, the auth and role guards, and correlation
  ids.

The Kysely adapters typecheck against the schema types, but the automated tests do not run
against a live PostgreSQL instance yet. The next step would be an integration suite that
starts PostgreSQL with Testcontainers.

## Example session

```bash
ADMIN=dev-admin-key-change-me
CLIENT=dev-client-key-change-me
API=http://localhost:3000

# Create an event (admin)
EVENT_ID=$(curl -s -X POST $API/events \
  -H "x-api-key: $ADMIN" -H 'content-type: application/json' \
  -d '{
    "name": "Autumn Symphony",
    "venue": "City Concert Hall",
    "startsAt": "2030-06-01T19:00:00Z",
    "currency": "EUR",
    "pricingTiers": [
      { "code": "VIP", "name": "VIP", "priceMinor": 12500 },
      { "code": "STD", "name": "Standard", "priceMinor": 4900 }
    ],
    "sections": [
      { "name": "A", "rows": [{ "name": "1", "tier": "VIP", "seatCount": 8 }] },
      { "name": "B", "rows": [{ "name": "1", "tier": "STD", "seatCount": 20 }] }
    ]
  }' | jq -r .id)

# See what is available
curl -s $API/events/$EVENT_ID/availability -H "x-api-key: $CLIENT" | jq .totals

# Hold two seats for five minutes
HOLD_ID=$(curl -s -X POST $API/events/$EVENT_ID/holds \
  -H "x-api-key: $CLIENT" -H 'content-type: application/json' \
  -d '{ "seatIds": ["A-1-1", "A-1-2"], "ttlSeconds": 300 }' | jq -r .id)

# Confirm; repeating this exact call returns the same booking with 200
curl -s -X POST $API/holds/$HOLD_ID/confirm \
  -H "x-api-key: $CLIENT" -H 'Idempotency-Key: order-7f3c2a91'

# Or give the seats back
curl -s -X DELETE $API/holds/$HOLD_ID -H "x-api-key: $CLIENT"

# Cancel a booking (admin)
curl -s -X POST $API/bookings/$BOOKING_ID/cancel \
  -H "x-api-key: $ADMIN" -H 'content-type: application/json' \
  -d '{ "reason": "customer request" }'
```

## License

MIT
