import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("poll due feeds", { minutes: 5 }, internal.graves.pollDue, {});
crons.daily("prune old items", { hourUTC: 19, minuteUTC: 0 }, internal.items.prune, {}); // 3 AM in Malaysia
crons.daily("clear old rate limits", { hourUTC: 19, minuteUTC: 30 }, internal.rateLimits.clearOld, {});
export default crons;
