# Headlamp plugin API notes (Sailor View)

This document captures how this repo talks to **[@kinvolk/headlamp-plugin](https://www.npmjs.com/package/@kinvolk/headlamp-plugin)** and the Headlamp frontend APIs, so we do not have to rediscover behavior by trial and error.

Exact sidebar trees can change between Headlamp releases; when in doubt, inspect **`node_modules/@kinvolk/headlamp-plugin/lib/components/Sidebar/useSidebarItems.js`** in the version pinned in `package.json`.

---

## Imports

Plugins import from the published package (see `src/index.tsx`):

```ts
import {
  registerRoute,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerResourceTableColumnsProcessor,
  registerDetailsViewSection,
  registerRouteFilter,
  registerPluginSettings,
} from '@kinvolk/headlamp-plugin/lib';
```

Type definitions for many symbols live under `node_modules/@kinvolk/headlamp-plugin/lib/plugin/registry.d.ts` and `lib/components/Sidebar/sidebarSlice.d.ts`.

---

## Sidebar entries: `name` vs `label`

Each sidebar row is a **`SidebarEntry`**: at minimum `name`, `label`, optional `parent`, `url`, `icon`, etc.

| Field | Meaning |
|--------|--------|
| **`name`** | Stable id used for routing, parent links, and **filters**. Not always human-readable. |
| **`label`** | Text shown in the UI (often translated). |

**Filters receive `entry.name` — not the label.** If you hide or match using the wrong string, nothing happens.

Examples:

- The group labeled **“Configuration”** uses **`name: 'config'`**, not `configuration`.
- The group labeled **“Security”** uses **`name: 'security'`**, not `Security` (unless you compare case-insensitively).

In this repo, `src/terminology/index.ts` normalizes with `(entry?.name ?? '').toLowerCase()` and matches against a `Set` of **lowercased** names. Any hide list must use the same normalization; mixed-case entries in the set (e.g. `'Security'`) will **not** match `'security'`.

---

## `registerSidebarEntryFilter`

```ts
registerSidebarEntryFilter(
  (entry: SidebarEntry) => SidebarEntry | null
);
```

- Return **`entry`** (possibly mutated) to keep the row.
- Return **`null`** to remove it.

Headlamp applies **every** registered filter in order. For the in-cluster sidebar it:

1. Filters **top-level** items with each filter function.
2. Recursively filters each item’s **`subList`** the same way.

So returning `null` for a **parent** row removes **that entire branch** (parent plus nested items). You do not have to list every child unless you only want to hide specific leaves.

---

## Default in-cluster sidebar: `name` reference

These are the **top-level** `name` values from `useSidebarItems.js` (namespace-scoped sidebar root). Hiding one of these removes the whole section.

| `name` | Typical label (English) |
|--------|-------------------------|
| `home` | Home |
| `cluster` | Cluster / Clusters |
| `map` | Map |
| `workloads` | Workloads |
| `storage` | Storage |
| `network` | Network |
| `gatewayapi` | Gateway (beta) |
| `security` | Security |
| `config` | Configuration |
| `crds` | Custom Resources |

**Nested** items use their own `name` values (often camelCase or PascalCase), for example:

- Under **workloads**: `Pods`, `Deployments`, `StatefulSets`, `DaemonSets`, `ReplicaSets`, `Jobs`, `CronJobs`.
- Under **storage**: `persistentVolumeClaims`, `persistentVolumes`, `storageClasses`.
- Under **network**: `services`, `endpoints`, `ingresses`, `NetworkPolicies`, …
- Under **gatewayapi**: `gateways`, `gatewayclasses`, `httproutes`, …
- Under **security**: `serviceAccounts`, `roles`, `roleBindings`.
- Under **config**: `configMaps`, `secrets`, `horizontalPodAutoscalers`, …

After `.toLowerCase()`, these become `pods`, `persistentvolumes`, `networkpolicies`, etc.

---

## `registerRoute` / `registerRouteFilter`

- **`registerRoute`** registers a URL, component, and optional `sidebar` id (highlights a sidebar entry when active).
- **`registerRouteFilter`** receives each route; return **`null`** to remove it from the app.

This repo also uses route filters in **`src/complexity/index.ts`** to hide advanced paths when “complexity hiding” is enabled. Sidebar and route filtering are separate: hiding a sidebar row does not automatically unregister the route (and vice versa) unless you implement both.

---

## `registerSidebarEntry`

Adds a row (optionally under a `parent` by **parent’s `name`**):

```ts
registerSidebarEntry({
  parent: null,
  name: 'sailor-dashboard',
  label: 'System Health',
  url: '/sailor-view/dashboard',
  icon: 'mdi:ship-wheel',
});
```

Custom entries are merged into the tree by `parent` and `sidebar` (see `useSidebarItems.js`).

---

## `registerResourceTableColumnsProcessor`

Called with column definitions for resource tables; return the array to use (this repo mutates/extends columns in **`src/terminology/index.ts`**).

---

## `registerPluginSettings`

Registers a settings page and optional “details” component. Must run early if other code reads config from your settings store on load.

**Where Headlamp stores the saved object:** Redux state key **`pluginConfigs[pluginName]`**, persisted under localStorage key **`pluginConfigs`** (JSON object of all plugins). It is **not** a per-plugin `headlamp-plugin-data-…` key. Read settings via the same Redux slice (or that localStorage object) or your filters will ignore the Save button.

Headlamp’s sidebar `useMemo` does not list `pluginConfigs` in its dependency array, so sidebar/route filters may not re-run after Save until navigation or a full reload. This plugin reloads the window when **filter-driving** saved settings change (`viewMode`, terminology, troubleshooting, complexity hiding, `hideRoutes`) so those apply immediately; namespace-only saves do not reload.

---

## Debugging tips

1. **Log the entry** inside your sidebar filter once: `console.log(entry.name, entry.label, entry.parent)` to see real `name` values.
2. **Confirm mode**: In this plugin, terminology and complexity filters no-op when settings say **admin** or the feature flag is off (`src/terminology/index.ts`, `src/complexity/index.ts`).
3. **Version drift**: After upgrading `@kinvolk/headlamp-plugin`, re-check `useSidebarItems.js` if sidebar hides stop matching.
