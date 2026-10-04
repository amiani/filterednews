import { describe, expect, layer } from "@effect/vitest";
import { Config, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/sql";

import { story } from "./fixtures.ts";
import * as Database from "../src/Database.ts";
import { StoryStore } from "../src/StoryStore.ts";

// Runs against a real Postgres database, migrated on startup.
const TestDatabase = Database.layer(
  Config.Redacted("TEST_DATABASE_URL").pipe(
    Config.withDefault(
      Redacted.make("postgres://localhost:5432/filterednews_test"),
    ),
  ),
);

const TestLayer = StoryStore.layerNoDeps.pipe(Layer.provideMerge(TestDatabase));

describe("StoryStore", () => {
  layer(TestLayer, { timeout: "30 seconds" })((it) => {
    it.effect("saves and finds scores per filter version", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`TRUNCATE stories CASCADE`;
        const store = yield* StoryStore;

        yield* store.saveScore(story(1, { text: "Ask HN text" }), "v1", 0.9);
        yield* store.saveScore(story(2, { url: null }), "v1", 0.2);
        yield* store.saveScore(story(1), "v2", 0.4);

        const v1 = yield* store.findScores(
          [story(1).id, story(2).id, story(3).id],
          "v1",
        );
        expect(Object.fromEntries(v1)).toEqual({ 1: 0.9, 2: 0.2 });
        const v2 = yield* store.findScores([story(1).id, story(2).id], "v2");
        expect(Object.fromEntries(v2)).toEqual({ 1: 0.4 });
        expect((yield* store.findScores([], "v1")).size).toBe(0);
      }),
    );

    it.effect("overwrites a score for the same version", () =>
      Effect.gen(function* () {
        const store = yield* StoryStore;
        yield* store.saveScore(story(1, { title: "Renamed" }), "v1", 0.7);
        const scores = yield* store.findScores([story(1).id], "v1");
        expect(scores.get(story(1).id)).toBe(0.7);
      }),
    );
  });
});
