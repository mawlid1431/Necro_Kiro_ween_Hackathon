import { createCn } from "cn/config";

// The brand type scale (app/globals.css @theme --text-*). Without it, class merging reads `text-meta` as a colour and
// drops the real text colour next to it (e.g. `text-on-ecto text-meta` lost the dark text on green buttons).
export const cn = createCn({
  extend: { theme: { text: ["hero", "h1", "h2", "h3", "body", "reader", "meta", "overline", "button"] } },
});
