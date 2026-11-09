# Second Opinion — design

- `opinions { userId, kindredId, agree[], differ[{ point, sources[] }], onlyOne[{ claim, source }],
  sources[{ itemId, feed }], model }` · `by_user_kindred`.
- `opinionNode.compare({ itemId })` ("use node"): owner check, loads ≤ 4 siblings (text ≤ 2,000 chars each),
  ladder task `opinion` (public article text), schema `OpinionSchema`, citations filtered to the group,
  Ghost fallback (first two sentences per source), saves and returns.
- UI: "Second opinion" button beside the Kindred badge; panel with three sections and source chips.
