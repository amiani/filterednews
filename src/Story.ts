import { Schema } from "effect";

export const StoryId = Schema.Int.pipe(Schema.brand("StoryId"));
export type StoryId = typeof StoryId.Type;

/** A story as it currently appears on the Hacker News front page. */
export const FrontPageStory = Schema.Struct({
  author: Schema.String,
  commentCount: Schema.Int,
  id: StoryId,
  points: Schema.Int,
  postedAt: Schema.DateTimeUtc,
  rank: Schema.Int,
  /** Raw HTML body for text posts such as Ask HN. */
  text: Schema.NullOr(Schema.String),
  title: Schema.String,
  url: Schema.NullOr(Schema.String),
});
export type FrontPageStory = typeof FrontPageStory.Type;

export const hnUrl = (id: StoryId): string =>
  `https://news.ycombinator.com/item?id=${id}`;

export const isShowHn = (story: Pick<FrontPageStory, "title">): boolean =>
  /^show hn\b/i.test(story.title.trim());

export const siteOf = (url: string | null): string | null => {
  if (url === null || !URL.canParse(url)) {
    return null;
  }
  return new URL(url).hostname.replace(/^www\./, "");
};

const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/** Converts HN's HTML item text into plain text. */
export const plainText = (html: string): string =>
  html
    .replace(/<p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10));
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .trim();
