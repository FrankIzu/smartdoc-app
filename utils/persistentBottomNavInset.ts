/** Matches app/components/PersistentBottomNavigation styles. */
const TAB_BAR_MIN_HEIGHT = 56;
const TAB_BAR_PADDING_TOP = 5;

/** Bottom bar on main tab routes only — calendar stack has its own header/back navigation. */
export function shouldShowPersistentBottomNav(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname;
  if (p === '/calendar' || p === '/calendar/' || p.startsWith('/calendar/')) return false;
  if (!p.startsWith('/(tabs)')) return false;
  const rest = p.replace(/^\/\(tabs\)\/?/, '') || 'index';
  const root = rest.split('/')[0];
  return ['index', 'documents', 'chats', 'help', 'settings'].includes(root);
}

/** Total height of PersistentBottomNavigation (for sheet bottom anchoring). */
export function persistentBottomNavInset(safeAreaBottom: number): number {
  return TAB_BAR_MIN_HEIGHT + TAB_BAR_PADDING_TOP + Math.max(safeAreaBottom, 5);
}
