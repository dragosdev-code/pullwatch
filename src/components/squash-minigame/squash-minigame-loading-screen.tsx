export function SquashMinigameLoadingScreen() {
  return (
    <div
      data-testid="squash-minigame-loading-screen"
      className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 bg-base-300 text-base-content"
    >
      <span className="loading loading-spinner loading-lg text-primary" aria-hidden />
      <p className="px-4 text-center font-mono text-[11px] uppercase tracking-widest text-base-content/70">
        Squash the Bugs
      </p>
    </div>
  );
}
