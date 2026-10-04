import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { HttpRouter } from "effect/http";

import { FrontPageDigest } from "./FrontPageDigest.ts";
import { Routes } from "./Http.ts";

const HttpLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.String("HOST").pipe(Config.withDefault("127.0.0.1")),
      port: Config.Port("PORT").pipe(Config.withDefault(3000)),
    }),
  ),
);

const Main = Layer.mergeAll(HttpLive, FrontPageDigest.worker).pipe(
  Layer.provide(FrontPageDigest.layer),
);

NodeRuntime.runMain(Layer.launch(Main));
