import { NodeServices } from "@effect/platform-node";
import { PgClient, PgMigrator } from "@effect/sql-pg";
import { Config, Effect, Layer, type Redacted } from "effect";
import { SqlClient } from "effect/sql";

const migrations = PgMigrator.fromRecord({
  "0001_create_stories": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE stories (
        id BIGINT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT,
        text TEXT,
        author TEXT NOT NULL,
        posted_at TIMESTAMPTZ NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    yield* sql`
      CREATE TABLE story_scores (
        story_id BIGINT NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        filter_version TEXT NOT NULL,
        ai_probability DOUBLE PRECISION NOT NULL CHECK (ai_probability BETWEEN 0 AND 1),
        scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (story_id, filter_version)
      )
    `;
  }),
});

/** A migrated Postgres connection pool. */
export const layer = (url: Config.Config<Redacted.Redacted>) => {
  const client = PgClient.layerConfig({ url });
  return PgMigrator.layer({ loader: migrations }).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(client),
  );
};

export const layerFromEnv = layer(Config.Redacted("DATABASE_URL"));
