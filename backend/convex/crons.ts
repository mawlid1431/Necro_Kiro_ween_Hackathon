import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("poll due feeds", { minutes: 5 }, internal.graves.pollDue, {});
crons.daily("prune old items", { hourUTC: 19, minuteUTC: 0 }, internal.items.prune, {}); // 3 AM in Malaysia
crons.daily("clear old rate limits", { hourUTC: 19, minuteUTC: 30 }, internal.rateLimits.clearOld, {});
crons.daily("refresh learning memory", { hourUTC: 18, minuteUTC: 0 }, internal.learning.refreshAll, {}); // 2 AM in Malaysia
crons.interval("mark stuck posts failed", { minutes: 15 }, internal.social.sweepStuck, {});
crons.daily("refresh instagram tokens", { hourUTC: 20, minuteUTC: 0 }, internal.socialNode.refreshInstagram, {});
export default crons;
