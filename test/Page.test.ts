import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";

import { story } from "./fixtures.ts";
import type { Digest } from "../src/FrontPageDigest.ts";
import { renderPage } from "../src/Page.ts";

const digest: Digest = {
  failedCount: 0,
  refreshedAt: DateTime.makeUnsafe("2026-10-04T12:00:00Z"),
  scored: [
    {
      aiProbability: 0.9,
      story: story(1, { title: "<script>alert(1)</script> & GPT" }),
    },
    { aiProbability: 0.1, story: story(2, { title: "Gardening tips" }) },
  ],
  showHnCount: 1,
  threshold: 0.5,
};

describe("renderPage", () => {
  it("escapes titles and shows only AI news", () => {
    const html = renderPage(digest);
    expect(html).toContain(
      "&#60;script&#62;alert(1)&#60;/script&#62; &#38; GPT",
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("Gardening tips");
  });

  it("marks the refresh time for local-timezone formatting", () => {
    expect(renderPage(digest)).toContain(
      '<time datetime="2026-10-04T12:00:00.000Z">',
    );
  });

  it("renders a loading state before the first refresh", () => {
    expect(renderPage(undefined)).toContain("Loading");
  });
});
