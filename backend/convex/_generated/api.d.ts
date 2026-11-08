/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as aiNode from "../aiNode.js";
import type * as aiUsage from "../aiUsage.js";
import type * as apiKeys from "../apiKeys.js";
import type * as askNode from "../askNode.js";
import type * as crons from "../crons.js";
import type * as doctor from "../doctor.js";
import type * as doctorNode from "../doctorNode.js";
import type * as drafts from "../drafts.js";
import type * as feedsNode from "../feedsNode.js";
import type * as graves from "../graves.js";
import type * as items from "../items.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_ladder from "../lib/ladder.js";
import type * as mcp from "../mcp.js";
import type * as providerHealth from "../providerHealth.js";
import type * as rateLimits from "../rateLimits.js";
import type * as seances from "../seances.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiNode: typeof aiNode;
  aiUsage: typeof aiUsage;
  apiKeys: typeof apiKeys;
  askNode: typeof askNode;
  crons: typeof crons;
  doctor: typeof doctor;
  doctorNode: typeof doctorNode;
  drafts: typeof drafts;
  feedsNode: typeof feedsNode;
  graves: typeof graves;
  items: typeof items;
  "lib/auth": typeof lib_auth;
  "lib/ladder": typeof lib_ladder;
  mcp: typeof mcp;
  providerHealth: typeof providerHealth;
  rateLimits: typeof rateLimits;
  seances: typeof seances;
  usage: typeof usage;
  users: typeof users;
  voice: typeof voice;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
