import {
  Config,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Ref,
  Schedule,
  Schema,
} from "effect";

import { AiNewsFilter } from "./AiNewsFilter.ts";
import { HackerNews, type HackerNewsError } from "./HackerNews.ts";
import { FrontPageStory, isShowHn } from "./Story.ts";
import { StoryStore, type StoryStoreError } from "./StoryStore.ts";

export const ScoredStory = Schema.Struct({
  aiProbability: Schema.Finite,
  story: FrontPageStory,
});
export type ScoredStory = typeof ScoredStory.Type;

/** The scored front page from one refresh. */
export const Digest = Schema.Struct({
  /** Stories whose scoring failed this refresh; they are retried on the next one. */
  failedCount: Schema.Int,
  refreshedAt: Schema.DateTimeUtc,
  /** Front page stories that were scored, in front page order. */
  scored: Schema.Array(ScoredStory),
  /** Show HN posts, which are excluded without scoring. */
  showHnCount: Schema.Int,
  threshold: Schema.Finite,
});
export type Digest = typeof Digest.Type;

export const isAiNews = (digest: Digest, item: ScoredStory): boolean =>
  item.aiProbability >= digest.threshold;

export interface DigestOptions {
  readonly threshold: number;
  readonly concurrency: number;
}

/** Builds and holds the latest AI-filtered view of the Hacker News front page. */
export class FrontPageDigest extends Context.Service<
  FrontPageDigest,
  {
    readonly latest: Effect.Effect<Option.Option<Digest>>;
    readonly refresh: Effect.Effect<Digest, HackerNewsError | StoryStoreError>;
  }
>()("filterednews/FrontPageDigest") {
  public static readonly make = Effect.fnUntraced(function* (
    options: DigestOptions,
  ) {
    const hackerNews = yield* HackerNews;
    const filter = yield* AiNewsFilter;
    const store = yield* StoryStore;
    const latest = yield* Ref.make(Option.none<Digest>());

    const scoreStory = (
      story: FrontPageStory,
      stored: ReadonlyMap<FrontPageStory["id"], number>,
    ) => {
      const known = stored.get(story.id);
      if (known !== undefined) {
        return Effect.succeedSome({ aiProbability: known, story });
      }
      return filter.score(story).pipe(
        Effect.tap((aiProbability) =>
          store.saveScore(story, filter.version, aiProbability),
        ),
        Effect.map((aiProbability) => Option.some({ aiProbability, story })),
        Effect.catchTag("AiNewsFilterError", (error) =>
          Effect.logWarning("Failed to score story", error).pipe(
            Effect.annotateLogs({ storyId: story.id, title: story.title }),
            Effect.as(Option.none<ScoredStory>()),
          ),
        ),
      );
    };

    const refresh = Effect.gen(function* () {
      const frontPage = yield* hackerNews.frontPage;
      const candidates = frontPage.filter((story) => !isShowHn(story));
      const stored = yield* store.findScores(
        candidates.map((story) => story.id),
        filter.version,
      );
      const results = yield* Effect.forEach(
        candidates,
        (story) => scoreStory(story, stored),
        {
          concurrency: options.concurrency,
        },
      );
      const scored = results.flatMap(Option.toArray);
      const digest: Digest = {
        failedCount: candidates.length - scored.length,
        refreshedAt: yield* DateTime.now,
        scored,
        showHnCount: frontPage.length - candidates.length,
        threshold: options.threshold,
      };
      yield* Ref.set(latest, Option.some(digest));
      yield* Effect.logInfo("Refreshed front page digest").pipe(
        Effect.annotateLogs({
          aiNews: scored.filter((item) => isAiNews(digest, item)).length,
          failed: digest.failedCount,
          newlyScored: candidates.length - stored.size,
          stories: frontPage.length,
        }),
      );
      return digest;
    }).pipe(Effect.withSpan("FrontPageDigest.refresh"));

    return FrontPageDigest.of({ latest: Ref.get(latest), refresh });
  });

  public static readonly layerNoDeps = Layer.effect(
    FrontPageDigest,
    Effect.gen(function* () {
      const threshold = yield* Config.Number("AI_THRESHOLD").pipe(
        Config.withDefault(0.5),
      );
      const concurrency = yield* Config.Int("SCORE_CONCURRENCY").pipe(
        Config.withDefault(4),
      );
      return yield* FrontPageDigest.make({ concurrency, threshold });
    }),
  );

  public static readonly layer = FrontPageDigest.layerNoDeps.pipe(
    Layer.provide([HackerNews.layer, AiNewsFilter.layer, StoryStore.layer]),
  );

  /** Refreshes the digest on startup and then on a fixed interval. */
  public static readonly worker = Layer.effectDiscard(
    Effect.gen(function* () {
      const digest = yield* FrontPageDigest;
      const interval = yield* Config.Duration("REFRESH_INTERVAL").pipe(
        Config.withDefault("10 minutes"),
      );
      yield* digest.refresh.pipe(
        Effect.catch((error) =>
          Effect.logError("Front page refresh failed", error),
        ),
        Effect.repeat(Schedule.spaced(interval)),
        Effect.forkScoped,
      );
    }),
  );
}
