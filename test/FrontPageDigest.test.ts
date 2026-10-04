import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Ref } from "effect";
import { AiError } from "effect/ai";

import { story } from "./fixtures.ts";
import { AiNewsFilter, AiNewsFilterError } from "../src/AiNewsFilter.ts";
import { FrontPageDigest, isAiNews } from "../src/FrontPageDigest.ts";
import { HackerNews } from "../src/HackerNews.ts";
import type { StoryId } from "../src/Story.ts";
import { StoryStore } from "../src/StoryStore.ts";

const VERSION = "test-version";

const frontPage = [
  story(1, { title: "New frontier model released" }),
  story(2, { title: "Show HN: My AI side project" }),
  story(3, { title: "A history of typewriters" }),
  story(4, { title: "Flaky story" }),
];

const scores: Record<number, number> = { 1: 0.9, 3: 0.1 };

const setup = Effect.gen(function* () {
  const scoredIds = yield* Ref.make<Array<StoryId>>([]);
  const filter = AiNewsFilter.of({
    score: (s) =>
      Effect.gen(function* () {
        yield* Ref.update(scoredIds, (ids) => [...ids, s.id]);
        const score = scores[s.id];
        if (score === undefined) {
          return yield* new AiNewsFilterError({
            reason: new AiError.InvalidOutputError({ description: "boom" }),
            storyId: s.id,
          });
        }
        return score;
      }),
    version: VERSION,
  });
  const layer = Layer.mergeAll(
    Layer.succeed(
      HackerNews,
      HackerNews.of({ frontPage: Effect.succeed(frontPage) }),
    ),
    Layer.succeed(AiNewsFilter, filter),
    StoryStore.layerMemory,
  );
  const { digest, store } = yield* Effect.gen(function* () {
    return {
      digest: yield* FrontPageDigest.make({ concurrency: 2, threshold: 0.5 }),
      store: yield* StoryStore,
    };
  }).pipe(Effect.provide(layer));
  return { digest, scoredIds, store };
});

describe("FrontPageDigest", () => {
  it.effect(
    "scores front page stories, skipping Show HN and tolerating failures",
    () =>
      Effect.gen(function* () {
        const { digest, store } = yield* setup;
        expect(Option.isNone(yield* digest.latest)).toBe(true);

        const result = yield* digest.refresh;
        expect(
          result.scored.map((item) => [item.story.id, item.aiProbability]),
        ).toEqual([
          [1, 0.9],
          [3, 0.1],
        ]);
        expect(
          result.scored
            .filter((item) => isAiNews(result, item))
            .map((item) => item.story.id),
        ).toEqual([1]);
        expect(result.showHnCount).toBe(1);
        expect(result.failedCount).toBe(1);
        expect(yield* digest.latest).toEqual(Option.some(result));

        const stored = yield* store.findScores(
          frontPage.map((s) => s.id),
          VERSION,
        );
        expect([...stored.entries()]).toEqual([
          [1, 0.9],
          [3, 0.1],
        ]);
      }),
  );

  it.effect(
    "reuses stored scores and retries failed stories on the next refresh",
    () =>
      Effect.gen(function* () {
        const { digest, scoredIds } = yield* setup;
        yield* digest.refresh;
        yield* Ref.set(scoredIds, []);
        yield* digest.refresh;
        expect(yield* Ref.get(scoredIds)).toEqual([4]);
      }),
  );
});
