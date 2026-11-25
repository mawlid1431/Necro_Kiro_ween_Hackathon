// Clerk's components are styled through its own variables API. They read the theme's CSS variables,
// so sign-in and the account menu follow light and dark mode with app/globals.css.
export const clerkAppearance = {
  variables: {
    colorBackground: "var(--color-surface)",
    colorPrimary: "#7cf29a",
    colorPrimaryForeground: "#0d0a14",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-subtle)",
    colorInput: "var(--color-surface)",
    colorInputForeground: "var(--color-ink)",
    colorBorder: "var(--color-line)",
    colorDanger: "var(--color-danger)",
    colorRing: "#3e8f58",
    fontFamily: "var(--font-jakarta), system-ui, sans-serif",
    borderRadius: "10px",
  },
};
