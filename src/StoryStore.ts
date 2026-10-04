import { Context, DateTime, Effect, Layer, Ref, Schema } from "effect";
import { SqlClient, type SqlError, SqlSchema } from "effect/sql";

import * as Database from "./Database.ts";
import { type FrontPageStory, StoryId } from "./Story.ts";

export class StoryStoreError extends Schema.TaggedError<StoryStoreError>()(
  "StoryStoreError",
  {
    cause: Schema.Defect(),
  },
) {}

const ScoreRow = Schema.Struct({
  aiProbability: Schema.Finite,
  storyId: Schema.FiniteFromString.pipe(Schema.decodeTo(StoryId)),
});

type Scores = ReadonlyMap<StoryId, number>;

/** Persists stories and their AI scores so each story is only scored once per filter version. */
export class StoryStore extends Context.Service<
  StoryStore,
  {
    findScores(
      ids: ReadonlyArray<StoryId>,
      filterVersion: string,
    ): Effect.Effect<Scores, StoryStoreError>;
    saveScore(
      story: FrontPageStory,
      filterVersion: string,
      aiProbability: number,
    ): Effect.Effect<void, StoryStoreError>;
  }
>()("filterednews/StoryStore") {
  public static readonly layerNoDeps = Layer.effect(
    StoryStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const storeError = <A, R>(
        effect: Effect.Effect<A, SqlError.SqlError | Schema.SchemaError, R>,
      ) => Effect.mapError(effect, (cause) => new StoryStoreError({ cause }));

      const selectScores = SqlSchema.findAll({
        Request: Schema.Struct({
          filterVersion: Schema.String,
          ids: Schema.Array(StoryId),
        }),
        Result: ScoreRow,
        execute: ({ filterVersion, ids }) =>
          sql`
            SELECT story_id::text AS "storyId", ai_probability AS "aiProbability"
            FROM story_scores
            WHERE filter_version = ${filterVersion} AND ${sql.in("story_id", ids)}
          `,
      });

      const findScores = Effect.fn("StoryStore.findScores")(function* (
        ids: ReadonlyArray<StoryId>,
        filterVersion: string,
      ) {
        if (ids.length === 0) {
          return new Map<StoryId, number>();
        }
        const rows = yield* selectScores({ filterVersion, ids });
        return new Map(
          rows.map((row) => [row.storyId, row.aiProbability] as const),
        );
      }, storeError);

      const saveScore = Effect.fn("StoryStore.saveScore")(
        function* (
          story: FrontPageStory,
          filterVersion: string,
          aiProbability: number,
        ) {
          yield* sql`
            INSERT INTO stories (id, title, url, text, author, posted_at)
            VALUES (
              ${story.id}, ${story.title}, ${story.url}, ${story.text}, ${story.author},
              ${DateTime.formatIso(story.postedAt)}::timestamptz
            )
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, text = EXCLUDED.text
          `;
          yield* sql`
            INSERT INTO story_scores (story_id, filter_version, ai_probability)
            VALUES (${story.id}, ${filterVersion}, ${aiProbability})
            ON CONFLICT (story_id, filter_version)
            DO UPDATE SET ai_probability = EXCLUDED.ai_probability, scored_at = now()
          `;
        },
        (effect) => sql.withTransaction(effect),
        storeError,
      );

      return StoryStore.of({ findScores, saveScore });
    }),
  );

  public static readonly layer = StoryStore.layerNoDeps.pipe(
    Layer.provide(Database.layerFromEnv),
  );

  /** In-memory implementation for tests and local experiments. */
  public static readonly layerMemory = Layer.effect(
    StoryStore,
    Effect.gen(function* () {
      const scores = yield* Ref.make(new Map<string, number>());
      const key = (id: StoryId, filterVersion: string) =>
        `${filterVersion}:${id}`;
      return StoryStore.of({
        findScores: (ids, filterVersion) =>
          Ref.get(scores).pipe(
            Effect.map((all) => {
              const found = new Map<StoryId, number>();
              for (const id of ids) {
                const score = all.get(key(id, filterVersion));
                if (score !== undefined) {
                  found.set(id, score);
                }
              }
              return found;
            }),
          ),
        saveScore: (story, filterVersion, aiProbability) =>
          Ref.update(scores, (all) =>
            new Map(all).set(key(story.id, filterVersion), aiProbability),
          ),
      });
    }),
  );
}
