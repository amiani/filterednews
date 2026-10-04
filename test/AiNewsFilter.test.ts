import { assert, describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Fiber, Ref, Schema } from "effect";
import { AiError, DecisionModel } from "effect/ai";
import { TestClock } from "effect/testing";

import { story } from "./fixtures.ts";
import { AiNewsFilter } from "../src/AiNewsFilter.ts";

const rateLimited = AiError.make({
  method: "decide",
  module: "Test",
  reason: new AiError.RateLimitError({}),
});
const quotaExhausted = AiError.make({
  method: "decide",
  module: "Test",
  reason: new AiError.QuotaExhaustedError({}),
});

const makeFilter = (responses: ReadonlyArray<AiError.AiError | number>) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<Array<unknown>>([]);
    const model = yield* DecisionModel.make({
      decide: ({ state }) =>
        Effect.gen(function* () {
          const n = (yield* Ref.getAndUpdate(calls, (all) => [...all, state]))
            .length;
          const response = responses[Math.min(n, responses.length - 1)];
          if (response === undefined) {
            return yield* Effect.die("no response configured");
          }
          if (typeof response !== "number") {
            return yield* response;
          }
          return {
            answers: { aiNews: { _tag: "Probability", probability: response } },
            usage: { inputTokens: 10, outputTokens: 1 },
          };
        }),
    });
    const filter = yield* AiNewsFilter.make("test/model").pipe(
      Effect.provideService(DecisionModel.DecisionModel, model),
    );
    return { calls, filter };
  });

describe("AiNewsFilter", () => {
  it.effect(
    "sends title, site, and plain text and returns the probability",
    () =>
      Effect.gen(function* () {
        const { calls, filter } = yield* makeFilter([0.83]);
        const probability = yield* filter.score(
          story(1, {
            text: "I&#x27;m curious<p>Thoughts?",
            title: "Ask HN: Which coding agent?",
            url: "https://www.example.com/post",
          }),
        );
        expect(probability).toBe(0.83);
        expect(yield* Ref.get(calls)).toEqual([
          {
            site: "example.com",
            text: "I'm curious\n\nThoughts?",
            title: "Ask HN: Which coding agent?",
          },
        ]);
        expect(filter.version).toBe("ai-news-v1/test/model");
      }),
  );

  it.effect("retries retryable provider errors", () =>
    Effect.gen(function* () {
      const { calls, filter } = yield* makeFilter([
        rateLimited,
        rateLimited,
        0.4,
      ]);
      const fiber = yield* Effect.forkChild(filter.score(story(1)));
      yield* TestClock.adjust("1 minute");
      expect(yield* Fiber.join(fiber)).toBe(0.4);
      expect((yield* Ref.get(calls)).length).toBe(3);
    }),
  );

  it.effect("fails with AiNewsFilterError on non-retryable errors", () =>
    Effect.gen(function* () {
      const { calls, filter } = yield* makeFilter([quotaExhausted]);
      const exit = yield* Effect.exit(filter.score(story(7)));
      assert.isTrue(Exit.isFailure(exit));
      const error = yield* Effect.flip(filter.score(story(7)));
      expect(error._tag).toBe("AiNewsFilterError");
      expect(error.storyId).toBe(7);
      expect(Schema.is(AiError.QuotaExhaustedError)(error.reason)).toBe(true);
      expect((yield* Ref.get(calls)).length).toBe(2);
    }),
  );
});
