import { DateTime } from "effect";

import { type Digest, isAiNews, type ScoredStory } from "./FrontPageDigest.ts";
import { hnUrl, siteOf } from "./Story.ts";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const percent = (probability: number) => `${Math.round(probability * 100)}%`;

const renderItem = (item: ScoredStory): string => {
  const { story } = item;
  const discussion = hnUrl(story.id);
  const site = siteOf(story.url);
  return `<li value="${story.rank}">
  <a class="title" href="${escapeHtml(story.url ?? discussion)}">${escapeHtml(story.title)}</a>
  ${site === null ? "" : `<span class="site">(${escapeHtml(site)})</span>`}
  <div class="meta">
    ${plural(story.points, "point")} by ${escapeHtml(story.author)}
    · <a href="${escapeHtml(discussion)}">${plural(story.commentCount, "comment")}</a>
    · <span title="AI news probability">AI ${percent(item.aiProbability)}</span>
  </div>
</li>`;
};

const renderBody = (digest: Digest | undefined): string => {
  if (digest === undefined) {
    return `<p class="empty">Loading the front page… refresh in a moment.</p>`;
  }
  const visible = digest.scored.filter((item) => isAiNews(digest, item));
  const list =
    visible.length === 0
      ? `<p class="empty">No AI news on the front page right now.</p>`
      : `<ol>${visible.map(renderItem).join("\n")}</ol>`;
  const failed =
    digest.failedCount > 0
      ? ` · ${digest.failedCount} could not be scored`
      : "";
  const refreshedAt = escapeHtml(DateTime.formatIso(digest.refreshedAt));
  return `${list}
<footer>
  Updated <time datetime="${refreshedAt}">${refreshedAt}</time> ·
  threshold ${percent(digest.threshold)} · ${digest.showHnCount} Show HN skipped${failed}
</footer>`;
};

export const renderPage = (digest: Digest | undefined): string =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI on Hacker News</title>
<style>
  body { font: 15px/1.45 system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.3rem; }
  ol { padding-left: 2.2rem; }
  li { margin: 0 0 .9rem; }
  a { color: #1a0dab; }
  a.title { font-weight: 600; text-decoration: none; }
  .site, .meta, footer, .empty { color: #666; font-size: .85rem; }
  footer { margin-top: 2rem; }
</style>
</head>
<body>
<h1>AI news on the Hacker News front page</h1>
${renderBody(digest)}
<script>
  for (const el of document.querySelectorAll("time[datetime]")) {
    el.textContent = new Date(el.dateTime).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    });
  }
</script>
</body>
</html>`;
