/**
 * Atmosphere layer for the light theme: a faint violet haze from the top left,
 * a soft ectoplasm glow from the bottom, and slow drifting mist. Decorative
 * only, so it is hidden from assistive tech and never intercepts clicks.
 */
export function FogBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-page">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_0%_0%,var(--color-violet-haze),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(70%_60%_at_50%_100%,color-mix(in_srgb,var(--color-ecto)_18%,transparent),transparent_70%)]" />
      <div className="absolute -inset-[10%] animate-fog-drift bg-[radial-gradient(40%_30%_at_30%_60%,color-mix(in_srgb,var(--color-bone)_70%,transparent),transparent_70%),radial-gradient(35%_25%_at_75%_40%,color-mix(in_srgb,var(--color-line)_60%,transparent),transparent_70%)] blur-2xl" />
    </div>
  );
}
