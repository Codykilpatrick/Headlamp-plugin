/**
 * Build cluster-scoped paths without importing Headlamp's createRouteURL (the bundled
 * plugin does not share Redux store wiring with the host app).
 */

export function getClusterPrefixFromPath(pathname: string): string | null {
  const m = pathname.match(/(\/c\/[^/]+)/);
  return m ? m[1] : null;
}

/** Prefix a path with /c/:cluster when the current location is under a cluster. */
export function withClusterPrefix(pathname: string, currentPathname: string): string {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const prefix = getClusterPrefixFromPath(currentPathname);
  return prefix ? `${prefix}${p}` : p;
}
