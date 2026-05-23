declare namespace chrome.events {
  // Matches the upstream @types/chrome Event generic constraint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Event<T extends (...args: any) => void> {
    dispatch(...args: Parameters<T>): void;
  }
}
