import React from 'react';

export interface NamespaceMapping {
  namespace: string;
  systemName: string;
}

export interface SailorViewSettings {
  // Namespace → friendly system-name mappings
  namespaceMappings: NamespaceMapping[];

  // Feature toggles
  enableTerminology: boolean;
  enableTroubleshooting: boolean;
  enableComplexityHiding: boolean;

  // Mode: 'sailor' hides complexity; 'admin' shows everything
  viewMode: 'sailor' | 'admin';

  // Complexity hiding — which route categories to suppress
  hideRoutes: {
    crds: boolean;
    clusterRoles: boolean;
    roles: boolean;
    serviceAccounts: boolean;
    apiExplorer: boolean;
    namespaces: boolean;
  };
}

export const DEFAULT_SETTINGS: SailorViewSettings = {
  namespaceMappings: [],
  enableTerminology: true,
  enableTroubleshooting: true,
  enableComplexityHiding: true,
  viewMode: 'sailor',
  hideRoutes: {
    crds: true,
    clusterRoles: true,
    roles: true,
    serviceAccounts: true,
    apiExplorer: true,
    namespaces: false,
  },
};

// ── Headlamp passes data + onDataChange to the settings component ────────────
interface SettingsProps {
  data: SailorViewSettings | null;
  onDataChange: (data: SailorViewSettings) => void;
}

export function SettingsPage({ data, onDataChange }: SettingsProps) {
  const settings: SailorViewSettings = { ...DEFAULT_SETTINGS, ...(data || {}) };

  function update(patch: Partial<SailorViewSettings>) {
    onDataChange({ ...settings, ...patch });
  }

  function updateHideRoutes(patch: Partial<SailorViewSettings['hideRoutes']>) {
    update({ hideRoutes: { ...settings.hideRoutes, ...patch } });
  }

  function addMapping() {
    update({ namespaceMappings: [...settings.namespaceMappings, { namespace: '', systemName: '' }] });
  }

  function removeMapping(idx: number) {
    update({ namespaceMappings: settings.namespaceMappings.filter((_, i) => i !== idx) });
  }

  function updateMapping(idx: number, field: keyof NamespaceMapping, value: string) {
    const mappings = [...settings.namespaceMappings];
    mappings[idx] = { ...mappings[idx], [field]: value };
    update({ namespaceMappings: mappings });
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: '24px',
    padding: '16px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
  };
  const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: '15px', marginBottom: '12px', display: 'block' };
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' };
  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', flex: 1 };
  const btnStyle: React.CSSProperties = { padding: '6px 14px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' };
  const checkRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' };

  return (
    <div style={{ maxWidth: '700px', fontFamily: 'sans-serif', padding: '8px' }}>
      <h2 style={{ marginBottom: '20px' }}>Sailor View Settings</h2>

      {/* ── View Mode ────────────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>View Mode</span>
        <div style={rowStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="viewMode"
              value="sailor"
              checked={settings.viewMode === 'sailor'}
              onChange={() => update({ viewMode: 'sailor' })}
            />
            Sailor View — simplified, hides Kubernetes complexity
          </label>
        </div>
        <div style={rowStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="viewMode"
              value="admin"
              checked={settings.viewMode === 'admin'}
              onChange={() => update({ viewMode: 'admin' })}
            />
            Full Admin View — all filters disabled, raw Kubernetes exposed
          </label>
        </div>
      </div>

      {/* ── Namespace → System Name Mappings ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Namespace → System Name Mappings</span>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
          Map Kubernetes namespaces to friendly names shown to sailors (e.g. "slemr-prod" → "SLEMR").
        </p>
        {settings.namespaceMappings.map((m, i) => (
          <div key={i} style={rowStyle}>
            <input
              style={inputStyle}
              placeholder="Namespace (e.g. slemr-prod)"
              value={m.namespace}
              onChange={e => updateMapping(i, 'namespace', e.target.value)}
            />
            <span style={{ color: '#999' }}>→</span>
            <input
              style={inputStyle}
              placeholder="System name (e.g. SLEMR)"
              value={m.systemName}
              onChange={e => updateMapping(i, 'systemName', e.target.value)}
            />
            <button style={{ ...btnStyle, color: '#c00' }} onClick={() => removeMapping(i)}>Remove</button>
          </div>
        ))}
        <button style={btnStyle} onClick={addMapping}>+ Add Mapping</button>
      </div>

      {/* ── Feature Toggles ──────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Feature Toggles</span>
        <div style={checkRowStyle}>
          <input
            type="checkbox"
            id="toggle-terminology"
            checked={settings.enableTerminology}
            onChange={e => update({ enableTerminology: e.target.checked })}
          />
          <label htmlFor="toggle-terminology">Plain Language Terminology — rename columns and sidebar items</label>
        </div>
        <div style={checkRowStyle}>
          <input
            type="checkbox"
            id="toggle-troubleshooting"
            checked={settings.enableTroubleshooting}
            onChange={e => update({ enableTroubleshooting: e.target.checked })}
          />
          <label htmlFor="toggle-troubleshooting">Guided Troubleshooting Panel — "What's happening?" on workload detail pages</label>
        </div>
        <div style={checkRowStyle}>
          <input
            type="checkbox"
            id="toggle-complexity"
            checked={settings.enableComplexityHiding}
            onChange={e => update({ enableComplexityHiding: e.target.checked })}
          />
          <label htmlFor="toggle-complexity">Complexity Hiding — suppress advanced Kubernetes routes and sidebar items</label>
        </div>
      </div>

      {/* ── Hidden Routes ────────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Hidden Routes (Complexity Hiding)</span>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
          Select which route categories to suppress in Sailor View mode.
        </p>
        {(
          [
            ['crds', 'Custom Resource Definitions (CRDs)'],
            ['clusterRoles', 'Cluster Roles'],
            ['roles', 'Roles'],
            ['serviceAccounts', 'Service Accounts'],
            ['apiExplorer', 'API Explorer'],
            ['namespaces', 'Namespaces'],
          ] as [keyof SailorViewSettings['hideRoutes'], string][]
        ).map(([key, label]) => (
          <div key={key} style={checkRowStyle}>
            <input
              type="checkbox"
              id={`hide-${key}`}
              checked={settings.hideRoutes[key]}
              onChange={e => updateHideRoutes({ [key]: e.target.checked })}
            />
            <label htmlFor={`hide-${key}`}>{label}</label>
          </div>
        ))}
      </div>
    </div>
  );
}
