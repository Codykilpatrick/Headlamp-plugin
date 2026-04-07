import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import IconButton from '@mui/material/IconButton';

export interface NamespaceMapping {
  namespace: string;
  systemName: string;
}

export interface SailorViewSettings {
  namespaceMappings: NamespaceMapping[];
  enableTerminology: boolean;
  enableTroubleshooting: boolean;
  enableComplexityHiding: boolean;
  viewMode: 'sailor' | 'admin';
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

  return (
    <Box sx={{ maxWidth: 700, p: 1 }}>
      <Typography variant="h5" gutterBottom>
        Sailor View Settings
      </Typography>

      {/* ── View Mode ─────────────────────────────────────────────────────── */}
      <Section title="View Mode">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Use <strong>Save</strong> at the bottom. View mode and the feature toggles that affect the
          sidebar or hidden routes trigger a quick reload so Headlamp picks them up; namespace
          mappings do not.
        </Typography>
        <RadioGroup
          name="sailor-view-mode"
          value={settings.viewMode}
          onChange={e => update({ viewMode: e.target.value as 'sailor' | 'admin' })}
        >
          <FormControlLabel
            value="sailor"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body1">Sailor View</Typography>
                <Typography variant="caption" color="text.secondary">
                  Simplified — plain-language labels, complexity hidden
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="admin"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body1">Full Admin View</Typography>
                <Typography variant="caption" color="text.secondary">
                  All filters disabled — raw Kubernetes exposed
                </Typography>
              </Box>
            }
          />
        </RadioGroup>
      </Section>

      {/* ── Namespace Mappings ────────────────────────────────────────────── */}
      <Section title="Namespace → System Name Mappings">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Map Kubernetes namespaces to friendly names shown to sailors (e.g. "prod-api" → "API Service").
        </Typography>
        {settings.namespaceMappings.map((m, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Namespace"
              placeholder="e.g. prod-api"
              value={m.namespace}
              onChange={e => updateMapping(i, 'namespace', e.target.value)}
              sx={{ flex: 1 }}
            />
            <Typography color="text.secondary">→</Typography>
            <TextField
              size="small"
              label="System name"
              placeholder="e.g. API Service"
              value={m.systemName}
              onChange={e => updateMapping(i, 'systemName', e.target.value)}
              sx={{ flex: 1 }}
            />
            <IconButton size="small" onClick={() => removeMapping(i)} aria-label="Remove mapping">
              ✕
            </IconButton>
          </Box>
        ))}
        <Button variant="outlined" size="small" onClick={addMapping} sx={{ mt: 1 }}>
          + Add Mapping
        </Button>
      </Section>

      {/* ── Feature Toggles ───────────────────────────────────────────────── */}
      <Section title="Feature Toggles">
        <ToggleRow
          label="Plain Language Terminology"
          description="Renames sidebar items and column headers (Pods → Processes, Namespace → System, etc.)"
          checked={settings.enableTerminology}
          onChange={v => update({ enableTerminology: v })}
        />
        <ToggleRow
          label="Guided Troubleshooting Panel"
          description={"Adds a \"What's happening?\" section to workload detail pages with plain-English diagnostics"}
          checked={settings.enableTroubleshooting}
          onChange={v => update({ enableTroubleshooting: v })}
        />
        <ToggleRow
          label="Complexity Hiding"
          description="Suppresses advanced Kubernetes routes and sidebar items (CRDs, Roles, etc.)"
          checked={settings.enableComplexityHiding}
          onChange={v => update({ enableComplexityHiding: v })}
        />
      </Section>

      {/* ── Hidden Routes ─────────────────────────────────────────────────── */}
      <Section title="Hidden Routes">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose which sections to hide when Complexity Hiding is enabled.
        </Typography>
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
          <ToggleRow
            key={key}
            label={label}
            checked={settings.hideRoutes[key]}
            onChange={v => updateHideRoutes({ [key]: v })}
          />
        ))}
      </Section>
    </Box>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {children}
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
      <Box sx={{ pr: 2 }}>
        <Typography variant="body2">{label}</Typography>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
      <Switch checked={checked} onChange={e => onChange(e.target.checked)} size="small" />
    </Box>
  );
}
