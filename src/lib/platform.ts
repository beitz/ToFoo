/**
 * iPhone and iPad: every browser there is Safari underneath, none offers to install the app, and
 * data kept in a browser tab can be deleted after 7 days without a visit. The Home Screen app is
 * exempt but keeps its own data, apart from the tab's.
 */
export function isAppleMobile(ua: string, platform: string, maxTouchPoints: number): boolean {
  // iPadOS asks for desktop sites and says it is a Mac; only the touch screen gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** Opened from the Home Screen (or as an installed app elsewhere), not in a browser tab. */
export function isInstalledApp(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** An iPhone or iPad browser tab: the place to suggest adding ToFoo to the Home Screen. */
export function isAppleBrowserTab(): boolean {
  return typeof navigator !== 'undefined' && isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) && !isInstalledApp();
}
