import type { Transition, Variants } from "motion/react";

// Motion presets from the brand guide (section 6). Components import these;
// never inline durations or easings.
export const easeRise = [0.2, 0.8, 0.2, 1] as const;

export const riseTransition: Transition = { duration: 0.6, ease: easeRise };

/** Tombstone lifts 4px and the ecto glow pulses once when a new item rises. */
export const rise: Variants = {
  rest: { y: 0, boxShadow: "0 0 0 rgb(124 242 154 / 0)" },
  risen: {
    y: [0, -4, 0],
    boxShadow: [
      "0 0 0 rgb(124 242 154 / 0)",
      "0 0 24px rgb(124 242 154 / 0.35)",
      "0 0 0 rgb(124 242 154 / 0)",
    ],
    transition: riseTransition,
  },
};

/** Fade up with a 150ms stagger (Resurrect drafts, landing cards). */
export const staggerChildren: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: riseTransition },
};
