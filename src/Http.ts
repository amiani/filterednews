import { Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { Digest, FrontPageDigest } from "./FrontPageDigest.ts";
import { renderPage } from "./Page.ts";

const DigestJson = Schema.toCodecJson(Digest);

export const Routes = HttpRouter.use(
  Effect.fn(function* (router) {
    const digest = yield* FrontPageDigest;

    yield* router.add(
      "GET",
      "/",
      Effect.map(digest.latest, (latest) =>
        HttpServerResponse.html(renderPage(Option.getOrUndefined(latest))),
      ),
    );

    yield* router.add(
      "GET",
      "/api/digest",
      Effect.gen(function* () {
        const latest = yield* digest.latest;
        if (Option.isNone(latest)) {
          return HttpServerResponse.empty({ status: 503 });
        }
        const body = yield* Schema.encodeEffect(DigestJson)(latest.value);
        return yield* HttpServerResponse.json(body);
      }).pipe(Effect.orDie),
    );

    yield* router.add("GET", "/health", HttpServerResponse.text("ok"));
  }),
);
