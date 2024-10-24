/**
 * A tiny framework that provides helpers to build a full stack web application in typescript and deno
 * Although it is tiny but it aims to make you develop a full stack app without using any ui or backend framework.
 * You just need to use native server that Deno or Bun provides.
 * It has utilities to transpile, bundle, and watch for ui development.
 * It has pub-sub and event-waiter for state management (especially ui).
 * It offers some basic web components.
 * For backend, it has a router.
 */

export { Router } from "./server/router.ts";
export type { Options, Route } from "./server/router.ts";
export { PubSub } from "./ui/pubsub.ts";
export { EventWaiter } from "./ui/event-waiter.ts";

export { toDot } from "./utils/imports-graph.ts";
export { Bundler } from "./utils/bundle.ts";
