import {
  Context,
  DateTime,
  Effect,
  flow,
  Layer,
  Schedule,
  Schema,
} from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";

import { type FrontPageStory, StoryId } from "./Story.ts";

const FRONT_PAGE_SIZE = 30;

const TopStories = Schema.Array(Schema.Int);

const Item = Schema.NullOr(
  Schema.Struct({
    by: Schema.optional(Schema.String),
    dead: Schema.optional(Schema.Boolean),
    deleted: Schema.optional(Schema.Boolean),
    descendants: Schema.optional(Schema.Int),
    id: Schema.Int,
    score: Schema.optional(Schema.Int),
    text: Schema.optional(Schema.String),
    time: Schema.Int,
    title: Schema.optional(Schema.String),
    type: Schema.String,
    url: Schema.optional(Schema.String),
  }),
);
type Item = typeof Item.Type;

export class HackerNewsError extends Schema.TaggedError<HackerNewsError>()(
  "HackerNewsError",
  {
    cause: Schema.Defect(),
  },
) {}

const toStory = (item: Item, rank: number): ReadonlyArray<FrontPageStory> => {
  if (
    item === null ||
    item.type !== "story" ||
    item.dead === true ||
    item.deleted === true ||
    item.title === undefined
  ) {
    return [];
  }
  return [
    {
      author: item.by ?? "",
      commentCount: item.descendants ?? 0,
      id: StoryId.make(item.id),
      points: item.score ?? 0,
      postedAt: DateTime.makeUnsafe(item.time * 1000),
      rank,
      text: item.text ?? null,
      title: item.title,
      url: item.url ?? null,
    },
  ];
};

/** Reads the current Hacker News front page from the official Firebase API. */
export class HackerNews extends Context.Service<
  HackerNews,
  {
    readonly frontPage: Effect.Effect<
      ReadonlyArray<FrontPageStory>,
      HackerNewsError
    >;
  }
>()("filterednews/HackerNews") {
  public static readonly layer = Layer.effect(
    HackerNews,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(
            HttpClientRequest.prependUrl(
              "https://hacker-news.firebaseio.com/v0",
            ),
            HttpClientRequest.acceptJson,
          ),
        ),
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({
          schedule: Schedule.exponential(200),
          times: 3,
        }),
      );

      const frontPage = Effect.gen(function* () {
        const ids = yield* client
          .get("/topstories.json")
          .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(TopStories)));
        const items = yield* Effect.forEach(
          ids.slice(0, FRONT_PAGE_SIZE),
          (id) =>
            client
              .get(`/item/${id}.json`)
              .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Item))),
          { concurrency: 10 },
        );
        return items.flatMap((item, index) => toStory(item, index + 1));
      }).pipe(
        Effect.mapError((cause) => new HackerNewsError({ cause })),
        Effect.withSpan("HackerNews.frontPage"),
      );

      return HackerNews.of({ frontPage });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
