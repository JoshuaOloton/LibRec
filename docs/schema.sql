-- LibRec: PostgreSQL schema (equivalent to prisma/schema.prisma)
-- For reference and for the report. In the project, Prisma generates this via
-- `npx prisma migrate dev`, so don't run both.

CREATE TYPE role AS ENUM ('PATRON', 'ADMIN');
CREATE TYPE interaction_type AS ENUM ('BORROW', 'RATE');
CREATE TYPE source_component AS ENUM ('CONTENT', 'COLLABORATIVE', 'HYBRID');

-- 1. USERS: patron and administrator accounts
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    name           TEXT        NOT NULL,
    email          TEXT        NOT NULL UNIQUE,
    password_hash  TEXT        NOT NULL,
    role           role        NOT NULL DEFAULT 'PATRON',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. BOOKS: the catalogue
CREATE TABLE books (
    book_id           SERIAL PRIMARY KEY,
    title             TEXT        NOT NULL,
    author            TEXT        NOT NULL,
    genres            TEXT[]      NOT NULL DEFAULT '{}',
    description       TEXT,
    publication_year  INTEGER,
    isbn              VARCHAR(10),
    cover_url         TEXT,
    content_text      TEXT        NOT NULL,          -- TF-IDF input: genres + author + description
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX books_title_idx  ON books (title);
CREATE INDEX books_author_idx ON books (author);

-- 3. INTERACTIONS: borrow and rating events (the sparse user-item matrix)
CREATE TABLE interactions (
    interaction_id    SERIAL PRIMARY KEY,
    user_id           INTEGER          NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    book_id           INTEGER          NOT NULL REFERENCES books (book_id) ON DELETE CASCADE,
    interaction_type  interaction_type NOT NULL,
    rating_value      DOUBLE PRECISION CHECK (rating_value BETWEEN 1 AND 5),   -- null for BORROW
    "timestamp"       TIMESTAMPTZ      NOT NULL DEFAULT now(),
    simulated         BOOLEAN          NOT NULL DEFAULT false,
    CHECK (
        (interaction_type = 'RATE'   AND rating_value IS NOT NULL) OR
        (interaction_type = 'BORROW' AND rating_value IS NULL)
    )
);
CREATE INDEX interactions_user_idx      ON interactions (user_id);
CREATE INDEX interactions_book_idx      ON interactions (book_id);
CREATE INDEX interactions_user_book_idx ON interactions (user_id, book_id);

-- 4. BOOK_FEATURES: derived TF-IDF vector, one per book (kept separate for NFR3)
CREATE TABLE book_features (
    feature_id    SERIAL PRIMARY KEY,
    book_id       INTEGER     NOT NULL UNIQUE REFERENCES books (book_id) ON DELETE CASCADE,
    tfidf_vector  JSONB       NOT NULL,            -- sparse { "termIndex": weight }
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RECOMMENDATION_LOGS: every served recommendation and its source (FR9)
CREATE TABLE recommendation_logs (
    log_id            SERIAL PRIMARY KEY,
    user_id           INTEGER          NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    book_id           INTEGER          NOT NULL REFERENCES books (book_id) ON DELETE CASCADE,
    source_component  source_component NOT NULL,
    score             DOUBLE PRECISION NOT NULL,
    rank              INTEGER,
    reason            TEXT,                           -- text shown in the reason slip (NFR1)
    served_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX rec_logs_user_served_idx ON recommendation_logs (user_id, served_at);
CREATE INDEX rec_logs_source_idx      ON recommendation_logs (source_component);

-- After seeding with explicit ids from the dataset, move the sequences past them,
-- otherwise new rows (e.g. a book added by an admin) collide with existing ids:
-- SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users));
-- SELECT setval(pg_get_serial_sequence('books', 'book_id'), (SELECT MAX(book_id) FROM books));
