import { describe, expect, it } from "@effect/vitest";

import { isShowHn, plainText, siteOf } from "../src/Story.ts";

describe("Story", () => {
  it("converts HN item HTML to plain text", () => {
    expect(
      plainText(
        'Hi, it&#x27;s &quot;here&quot;<p>See <a href="x">this</a> &amp; that',
      ),
    ).toBe('Hi, it\'s "here"\n\nSee this & that');
  });

  it("detects Show HN posts", () => {
    expect(isShowHn({ title: "Show HN: AI photo search" })).toBe(true);
    expect(isShowHn({ title: "show hn – thing" })).toBe(true);
    expect(isShowHn({ title: "Ask HN: Show HN etiquette?" })).toBe(false);
    expect(isShowHn({ title: "Showing HN data" })).toBe(false);
  });

  it("extracts the site from a URL", () => {
    expect(siteOf("https://www.example.com/a/b")).toBe("example.com");
    expect(siteOf(null)).toBe(null);
    expect(siteOf("not a url")).toBe(null);
  });
});
