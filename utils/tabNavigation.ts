import type { Href, Router } from 'expo-router';

/** Whether `pathname` is already showing the bottom-nav target `route`. */
export function isPrimaryShellRouteActive(pathname: string | null | undefined, route: string): boolean {
  if (!pathname) return false;
  if (route === '/(tabs)' || route === '/(tabs)/' || route === '/(tabs)/index') {
    return (
      pathname === '/' ||
      pathname === '/(tabs)' ||
      pathname === '/(tabs)/' ||
      pathname === '/(tabs)/index'
    );
  }
  if (route === '/calendar') {
    return pathname === '/calendar' || pathname === '/calendar/';
  }
  if (pathname === route || pathname.startsWith(`${route}/`)) return true;
  // Expo may omit the "(tabs)" group in usePathname()
  const leaf = route.replace(/^\/\(tabs\)/, '') || '/';
  if (leaf !== '/' && (pathname === leaf || pathname.startsWith(`${leaf}/`))) return true;
  return false;
}

/**
 * Switch to a primary shell screen without stacking another copy.
 * Prefer navigate (jump to existing entry when present) over push — otherwise
 * Android/iOS back replays the same tabs ("page repeats twice").
 */
export function navigatePrimaryShell(router: Router, route: Href | string, pathname?: string | null): void {
  const path = typeof route === 'string' ? route : String(route);
  if (pathname != null && isPrimaryShellRouteActive(pathname, path)) return;
  router.navigate(route as Href);
}
