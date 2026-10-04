/**
 * Scores the current front page without touching the database, for tuning
 * the AI news decision. Run with: pnpm spike
 */
import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";

import { AiNewsFilter } from "../src/AiNewsFilter.ts";
import { FrontPageDigest, isAiNews } from "../src/FrontPageDigest.ts";
import { HackerNews } from "../src/HackerNews.ts";
import { StoryStore } from "../src/StoryStore.ts";

const program = Effect.gen(function* () {
  const digest = yield* (yield* FrontPageDigest).refresh;
  for (const item of digest.scored) {
    const mark = isAiNews(digest, item) ? "AI " : "   ";
    console.log(
      `${mark} ${item.aiProbability.toFixed(2)}  #${item.story.rank}  ${item.story.title}`,
    );
  }
  console.log(
    `\n${digest.showHnCount} Show HN skipped, ${digest.failedCount} failed`,
  );
});

program.pipe(
  Effect.provide(
    FrontPageDigest.layerNoDeps.pipe(
      Layer.provide([
        HackerNews.layer,
        AiNewsFilter.layer,
        StoryStore.layerMemory,
      ]),
    ),
  ),
  NodeRuntime.runMain,
);
