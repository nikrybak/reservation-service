CREATE TABLE ticketed_events (
  id            uuid PRIMARY KEY,
  name          text        NOT NULL,
  venue         text        NOT NULL,
  starts_at     timestamptz NOT NULL,
  currency      char(3)     NOT NULL,
  pricing_tiers jsonb       NOT NULL,
  layout        jsonb       NOT NULL,
  created_at    timestamptz NOT NULL
);

CREATE TABLE seats (
  event_id   uuid    NOT NULL REFERENCES ticketed_events (id) ON DELETE CASCADE,
  seat_id    text    NOT NULL,
  tier_code  text    NOT NULL,
  status     text    NOT NULL CHECK (status IN ('available', 'held', 'booked')),
  hold_id    uuid,
  held_until timestamptz,
  booking_id uuid,
  version    integer NOT NULL CHECK (version > 0),
  PRIMARY KEY (event_id, seat_id),
  CHECK ((status = 'held') = (hold_id IS NOT NULL AND held_until IS NOT NULL)),
  CHECK ((status = 'booked') = (booking_id IS NOT NULL))
);

CREATE TABLE holds (
  id          uuid PRIMARY KEY,
  event_id    uuid        NOT NULL REFERENCES ticketed_events (id) ON DELETE CASCADE,
  holder_id   text        NOT NULL,
  seats       jsonb       NOT NULL,
  total_minor bigint      NOT NULL CHECK (total_minor >= 0),
  currency    char(3)     NOT NULL,
  status      text        NOT NULL CHECK (status IN ('active', 'confirmed', 'released', 'expired')),
  created_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  version     integer     NOT NULL CHECK (version > 0)
);

-- The expiry sweep only ever scans active holds, so keep that index small.
CREATE INDEX holds_active_expiry_idx ON holds (expires_at) WHERE status = 'active';

CREATE TABLE bookings (
  id              uuid PRIMARY KEY,
  hold_id         uuid        NOT NULL UNIQUE REFERENCES holds (id),
  event_id        uuid        NOT NULL REFERENCES ticketed_events (id),
  holder_id       text        NOT NULL,
  idempotency_key text        NOT NULL,
  seats           jsonb       NOT NULL,
  total_minor     bigint      NOT NULL CHECK (total_minor >= 0),
  currency        char(3)     NOT NULL,
  status          text        NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  created_at      timestamptz NOT NULL,
  cancelled_at    timestamptz,
  version         integer     NOT NULL CHECK (version > 0),
  UNIQUE (holder_id, idempotency_key)
);

CREATE TABLE outbox (
  seq               bigserial UNIQUE,
  id                uuid PRIMARY KEY,
  name              text        NOT NULL,
  aggregate_id      uuid        NOT NULL,
  ticketed_event_id uuid        NOT NULL,
  payload           jsonb       NOT NULL,
  occurred_at       timestamptz NOT NULL,
  attempts          integer     NOT NULL DEFAULT 0,
  next_attempt_at   timestamptz NOT NULL,
  locked_until      timestamptz,
  published_at      timestamptz,
  dead_at           timestamptz,
  last_error        text
);

CREATE INDEX outbox_pending_idx ON outbox (next_attempt_at, seq)
  WHERE published_at IS NULL AND dead_at IS NULL;
