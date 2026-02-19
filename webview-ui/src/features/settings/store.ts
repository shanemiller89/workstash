import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────

export interface SettingsData {
    // Stash
    autoRefresh: boolean;
    confirmOnDrop: boolean;
    confirmOnClear: boolean;
    showFileStatus: boolean;
    defaultIncludeUntracked: boolean;
    sortOrder: 'newest' | 'oldest';
    showBranchInDescription: boolean;
    // Notes
    autosaveDelay: number;
    defaultVisibility: 'secret' | 'public';
    // Mattermost
    mattermostServerUrl: string;
    // GitHub
    orgLogin: string;
    showOrgIssues: boolean;
    // AI Privacy
    includeSecretGists: boolean;
    includePrivateMessages: boolean;
    // AI Provider
    aiProvider: 'copilot' | 'gemini' | 'none';
    providerPreference: 'auto' | 'copilot' | 'gemini';
    geminiApiKey: string;
    geminiModel: string;
}

// ─── Store ────────────────────────────────────────────────────────

interface SettingsStore {
    settings: SettingsData | null;
    orgs: { login: string; avatarUrl: string; name: string | null }[];
    orgsLoading: boolean;
    setSettings: (settings: SettingsData) => void;
    setOrgs: (orgs: { login: string; avatarUrl: string; name: string | null }[]) => void;
    setOrgsLoading: (v: boolean) => void;
    updateSetting: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    settings: null,
    orgs: [],
    orgsLoading: false,

    setSettings: (settings) => set({
        settings: {
            ...settings,
            // Ensure fields added in newer builds are never undefined
            orgLogin: settings.orgLogin ?? '',
            showOrgIssues: settings.showOrgIssues ?? false,
        },
    }),

    updateSetting: (key, value) =>
        set((s) =>
            s.settings
                ? { settings: { ...s.settings, [key]: value } }
                : s,
        ),

    setOrgs: (orgs) => set({ orgs, orgsLoading: false }),
    setOrgsLoading: (v) => set({ orgsLoading: v }),
}));
