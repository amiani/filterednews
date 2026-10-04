import {
  OpenRouterClient,
  OpenRouterDecisionModel,
} from "@effect/ai-openrouter";
import { Config, Context, Effect, Layer, Schedule, Schema } from "effect";
import { AiError, Decision, DecisionModel } from "effect/ai";
import { FetchHttpClient } from "effect/http";

import { type FrontPageStory, plainText, siteOf, StoryId } from "./Story.ts";

/** Bump when the decision below changes, so stories are scored again. */
const PROMPT_VERSION = "ai-news-v1";

const MAX_TEXT_LENGTH = 1500;

const AiNewsInput = Schema.Struct({
  site: Schema.NullOr(Schema.String),
  text: Schema.NullOr(Schema.String),
  title: Schema.String,
});

export const AiNewsDecision = Decision.make({
  decisions: {
    aiNews: Decision.probability({
      criteria: {
        false:
          "Not primarily about AI: general software, hardware, science, business, games, or culture, " +
          "including stories that only mention AI in passing.",
        true:
          "Primarily about AI: new model or AI product releases; AI research papers and results; " +
          "announcements or significant news from major AI labs (OpenAI, Anthropic, Google DeepMind, Meta AI, " +
          "xAI, Mistral, DeepSeek, and similar); government or regulatory AI policy announcements; " +
          "or advances, tools, techniques, advice, or opinion about AI-assisted coding and coding agents.",
      },
      instructions:
        "This Hacker News link belongs in a feed for keeping up with the latest developments in AI. " +
        "Judge from the title, the site it links to, and the post text if present.",
    }),
  },
  input: AiNewsInput,
});

export const toDecisionInput = (
  story: FrontPageStory,
): typeof AiNewsInput.Type => ({
  site: siteOf(story.url),
  text:
    story.text === null
      ? null
      : plainText(story.text).slice(0, MAX_TEXT_LENGTH),
  title: story.title,
});

export class AiNewsFilterError extends Schema.TaggedError<AiNewsFilterError>()(
  "AiNewsFilterError",
  {
    reason: AiError.AiErrorReason,
    storyId: StoryId,
  },
) {}

/** Scores how likely a story is to be AI news, using a decision model. */
export class AiNewsFilter extends Context.Service<
  AiNewsFilter,
  {
    /** Identifies the prompt and model; stored scores are only reused for the same version. */
    readonly version: string;
    score(story: FrontPageStory): Effect.Effect<number, AiNewsFilterError>;
  }
>()("filterednews/AiNewsFilter") {
  public static readonly make = Effect.fnUntraced(function* (
    modelName: string,
  ) {
    const model = yield* DecisionModel.DecisionModel;

    const score = Effect.fn("AiNewsFilter.score")(
      function* (story: FrontPageStory) {
        yield* Effect.annotateCurrentSpan({ storyId: story.id });
        const { answers } = yield* model.decide(AiNewsDecision, {
          input: toDecisionInput(story),
        });
        return answers.aiNews.probability;
      },
      Effect.retry({
        schedule: Schedule.exponential("1 second"),
        times: 3,
        while: (error) => error.isRetryable,
      }),
      (effect, story) =>
        Effect.mapError(
          effect,
          (error) =>
            new AiNewsFilterError({ reason: error.reason, storyId: story.id }),
        ),
    );

    return AiNewsFilter.of({
      score,
      version: `${PROMPT_VERSION}/${modelName}`,
    });
  });

  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const modelName = yield* Config.String("DECISION_MODEL").pipe(
        Config.withDefault("~typesafe/jev-latest"),
      );
      return Layer.effect(AiNewsFilter, AiNewsFilter.make(modelName)).pipe(
        Layer.provide(OpenRouterDecisionModel.layer({ model: modelName })),
      );
    }),
  ).pipe(
    Layer.provide(
      OpenRouterClient.layerConfig({
        apiKey: Config.Redacted("OPENROUTER_API_KEY"),
        siteTitle: Config.succeed("filterednews"),
      }),
    ),
    Layer.provide(FetchHttpClient.layer),
  );
}
