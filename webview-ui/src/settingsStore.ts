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
    setSettings: (settings: SettingsData) => void;
    updateSetting: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    settings: null,

    setSettings: (settings) => set({ settings }),

    updateSetting: (key, value) =>
        set((s) =>
            s.settings
                ? { settings: { ...s.settings, [key]: value } }
                : s,
        ),
}));
