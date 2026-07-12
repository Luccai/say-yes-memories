export function shouldShowOwnerProfile(
  hasProfile: boolean,
  source: string,
  failedSource: string,
) {
  return hasProfile && source !== failedSource;
}
