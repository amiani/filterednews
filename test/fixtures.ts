import { DateTime } from "effect";

import { type FrontPageStory, StoryId } from "../src/Story.ts";

export const story = (
  id: number,
  overrides: Partial<Omit<FrontPageStory, "id">> = {},
): FrontPageStory => ({
  author: "pg",
  commentCount: 10,
  id: StoryId.make(id),
  points: 100,
  postedAt: DateTime.makeUnsafe("2026-10-04T12:00:00Z"),
  rank: id,
  text: null,
  title: `Story ${id}`,
  url: `https://example.com/${id}`,
  ...overrides,
});
