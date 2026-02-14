import React, { useCallback, useEffect, useState } from 'react';
import { useAIStore, type AIModelInfo } from '../aiStore';
import { useMattermostStore } from '../mattermostStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
    Settings,
    Cpu,
    Shield,
    MessageSquare,
    Archive,
    StickyNote,
    Bot,
    Key,
    CheckCircle2,
    XCircle,
    Eye,
    EyeOff,
    RefreshCw,
    ExternalLink,
} from 'lucide-react';

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
    geminiApiKey: string;
    geminiModel: string;
}

// ─── Section Components ───────────────────────────────────────────

const SettingRow: React.FC<{
    label: string;
    description?: string;
    children: React.ReactNode;
}> = ({ label, description, children }) => (
    <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex-1 min-w-0">
            <Label className="text-[12px] font-medium text-fg">{label}</Label>
            {description && (
                <p className="text-[10.5px] text-fg/40 mt-0.5 leading-snug">{description}</p>
            )}
        </div>
        <div className="flex-shrink-0">{children}</div>
    </div>
);

const SectionCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}> = ({ icon, title, children }) => (
    <Card className="border-border/50">
        <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[12px] font-semibold text-fg/80 uppercase tracking-wider flex items-center gap-2">
                {icon}
                {title}
            </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
            {children}
        </CardContent>
    </Card>
);

// ─── Gemini Models (must match package.json enum) ─────────────────

const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
];

// ─── Main Component ───────────────────────────────────────────────

export const SettingsTab: React.FC = () => {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [showApiKey, setShowApiKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [apiKeySaved, setApiKeySaved] = useState(false);

    // AI store data
    const aiProvider = useAIStore((s) => s.aiProvider);
    const aiAvailable = useAIStore((s) => s.aiAvailable);
    const availableModels = useAIStore((s) => s.availableModels);
    const modelAssignments = useAIStore((s) => s.modelAssignments);

    // Mattermost state
    const isMMConfigured = useMattermostStore((s) => s.isConfigured);
    const mmCurrentUser = useMattermostStore((s) => s.currentUser);

    // Request settings on mount
    useEffect(() => {
        postMessage('settings.getSettings');
        // Also refresh model list
        if (aiAvailable) {
            postMessage('ai.listModels');
        }
    }, [aiAvailable]);

    // Listen for settings data from extension
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'settingsData') {
                setSettings(msg.settings as SettingsData);
                setApiKeyInput(msg.settings.geminiApiKey ? '••••••••••••' : '');
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Update a single setting
    const updateSetting = useCallback((key: string, value: unknown) => {
        postMessage('settings.updateSetting', { key, value });
        setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
    }, []);

    // Save Gemini API key
    const handleSaveApiKey = useCallback(() => {
        if (apiKeyInput && !apiKeyInput.startsWith('••')) {
            updateSetting('geminiApiKey', apiKeyInput);
            setApiKeySaved(true);
            setApiKeyInput('••••••••••••');
            setTimeout(() => setApiKeySaved(false), 2000);
        }
    }, [apiKeyInput, updateSetting]);

    // Clear Gemini API key
    const handleClearApiKey = useCallback(() => {
        updateSetting('geminiApiKey', '');
        setApiKeyInput('');
        setShowApiKey(false);
    }, [updateSetting]);

    // Handle model assignment change
    const handleModelChange = useCallback((purpose: string, modelId: string) => {
        postMessage('ai.setModel', { purpose, modelId: modelId === '__default__' ? '' : modelId });
    }, []);

    if (!settings) {
        return (
            <div className="flex items-center justify-center h-full text-fg/40 text-[12px]">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Loading settings…
            </div>
        );
    }

    const MODEL_PURPOSES = [
        { key: 'summary', label: 'Summaries' },
        { key: 'chat', label: 'Chat' },
        { key: 'agent', label: 'Agent' },
    ];

    return (
        <ScrollArea className="h-full">
            <div className="max-w-xl mx-auto px-6 py-6 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                            <Settings size={16} className="text-accent" />
                        </div>
                        <div>
                            <h2 className="text-[14px] font-semibold text-fg">Settings</h2>
                            <p className="text-[11px] text-fg/40">
                                Configure WorkStash preferences
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-[11px] gap-1.5"
                        onClick={() => postMessage('settings.openInVSCode')}
                    >
                        <ExternalLink size={12} />
                        VS Code Settings
                    </Button>
                </div>

                <Separator />

                {/* ═══ AI Provider ═══ */}
                <SectionCard
                    icon={<Bot size={12} />}
                    title="AI Provider"
                >
                    <div className="space-y-3">
                        {/* Current status */}
                        <div className="flex items-center gap-2 py-1">
                            <span className="text-[11px] text-fg/60">Active provider:</span>
                            {aiProvider === 'copilot' ? (
                                <Badge variant="default" className="text-[10px]">
                                    <CheckCircle2 size={10} className="mr-1" />
                                    GitHub Copilot
                                </Badge>
                            ) : aiProvider === 'gemini' ? (
                                <Badge variant="outline" className="text-[10px]">
                                    <CheckCircle2 size={10} className="mr-1" />
                                    Gemini
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                    <XCircle size={10} className="mr-1" />
                                    None
                                </Badge>
                            )}
                        </div>

                        <p className="text-[10.5px] text-fg/40 leading-snug">
                            GitHub Copilot is used automatically when available. Configure a Gemini API key as a fallback
                            for editors without Copilot (Cursor, Windsurf, etc.).
                        </p>

                        <Separator className="my-1" />

                        {/* Gemini API Key */}
                        <div className="space-y-2">
                            <Label className="text-[11px] font-medium text-fg/70">Gemini API Key</Label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <Input
                                        type={showApiKey ? 'text' : 'password'}
                                        placeholder="Enter Gemini API key…"
                                        value={apiKeyInput}
                                        onChange={(e) => {
                                            setApiKeyInput(e.target.value);
                                            setApiKeySaved(false);
                                        }}
                                        onFocus={() => {
                                            if (apiKeyInput.startsWith('••')) {
                                                setApiKeyInput('');
                                            }
                                        }}
                                        className="text-[11px] pr-8"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-fg/30 hover:text-fg/60"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                    >
                                        {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </Button>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={handleSaveApiKey}
                                    disabled={!apiKeyInput || apiKeyInput.startsWith('••')}
                                >
                                    {apiKeySaved ? <CheckCircle2 size={12} /> : <Key size={12} />}
                                    {apiKeySaved ? 'Saved' : 'Save'}
                                </Button>
                                {settings.geminiApiKey && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={handleClearApiKey}
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                            <p className="text-[10px] text-fg/30">
                                Get a free key at{' '}
                                <a
                                    href="https://aistudio.google.com/apikey"
                                    className="text-accent hover:underline"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        postMessage('openExternal', { url: 'https://aistudio.google.com/apikey' });
                                    }}
                                >
                                    aistudio.google.com/apikey
                                </a>
                            </p>
                        </div>

                        {/* Default Gemini Model */}
                        <SettingRow
                            label="Default Gemini Model"
                            description="Model used when Gemini is the active provider"
                        >
                            <Select
                                value={settings.geminiModel}
                                onValueChange={(v) => updateSetting('geminiModel', v)}
                            >
                                <SelectTrigger className="w-[180px] h-7 text-[11px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {GEMINI_MODELS.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </SettingRow>
                    </div>
                </SectionCard>

                {/* ═══ AI Models (per-purpose) ═══ */}
                {aiAvailable && (
                    <SectionCard
                        icon={<Cpu size={12} />}
                        title="Model Assignments"
                    >
                        <p className="text-[10.5px] text-fg/40 leading-snug mb-2">
                            Override which model is used for each AI feature. Leave on "Default" to use the provider's default model.
                            {aiProvider === 'gemini' && ' Changes are saved to VS Code settings automatically.'}
                        </p>
                        {availableModels.length === 0 ? (
                            <div className="flex items-center gap-2 py-2">
                                <RefreshCw size={12} className="animate-spin text-fg/30" />
                                <span className="text-[11px] text-fg/40">Loading available models…</span>
                            </div>
                        ) : (
                            MODEL_PURPOSES.map(({ key, label }) => (
                                <SettingRow key={key} label={label}>
                                    <Select
                                        value={modelAssignments[key] || '__default__'}
                                        onValueChange={(v) => handleModelChange(key, v ?? '__default__')}
                                    >
                                        <SelectTrigger className="w-[200px] h-7 text-[11px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__default__">Default</SelectItem>
                                            {availableModels.map((m) => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    {m.name || m.id}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </SettingRow>
                            ))
                        )}
                    </SectionCard>
                )}

                {/* ═══ AI Privacy ═══ */}
                <SectionCard
                    icon={<Shield size={12} />}
                    title="AI Privacy"
                >
                    <SettingRow
                        label="Include Secret Gists"
                        description="Share secret Gist note content with the AI model for summaries, chat, and agent analysis"
                    >
                        <Switch
                            checked={settings.includeSecretGists}
                            onCheckedChange={(v) => updateSetting('includeSecretGists', v)}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Include Private Messages"
                        description="Share DMs and group messages from Mattermost with the AI model"
                    >
                        <Switch
                            checked={settings.includePrivateMessages}
                            onCheckedChange={(v) => updateSetting('includePrivateMessages', v)}
                        />
                    </SettingRow>
                </SectionCard>

                {/* ═══ Mattermost ═══ */}
                <SectionCard
                    icon={<MessageSquare size={12} />}
                    title="Mattermost"
                >
                    <SettingRow
                        label="Server URL"
                        description="Your Mattermost server address"
                    >
                        <div className="flex items-center gap-1.5">
                            {isMMConfigured ? (
                                <Badge variant="outline" className="text-[10px]">
                                    <CheckCircle2 size={10} className="mr-1" />
                                    {mmCurrentUser?.username ?? 'Connected'}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                    Not configured
                                </Badge>
                            )}
                        </div>
                    </SettingRow>
                    <div className="flex gap-1.5 mt-1">
                        {!isMMConfigured ? (
                            <>
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => postMessage('mattermost.signIn')}
                                >
                                    Sign in with password
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => postMessage('mattermost.signInWithToken')}
                                >
                                    Use token
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => postMessage('mattermost.signInWithSessionToken')}
                                >
                                    Use session token
                                </Button>
                            </>
                        ) : (
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => postMessage('mattermost.signOut')}
                            >
                                Sign out
                            </Button>
                        )}
                    </div>
                    <Separator className="my-2" />
                    <SettingRow
                        label="Server URL"
                        description="Set in VS Code settings (requires restart)"
                    >
                        <Input
                            value={settings.mattermostServerUrl}
                            placeholder="https://mattermost.example.com"
                            className="w-[220px] h-7 text-[11px]"
                            onChange={(e) => updateSetting('mattermostServerUrl', e.target.value)}
                            onBlur={(e) => updateSetting('mattermostServerUrl', e.target.value.trim().replace(/\/+$/, ''))}
                        />
                    </SettingRow>
                </SectionCard>

                {/* ═══ Stash ═══ */}
                <SectionCard
                    icon={<Archive size={12} />}
                    title="Stash"
                >
                    <SettingRow
                        label="Auto-refresh"
                        description="Refresh stash list on git changes or window focus"
                    >
                        <Switch
                            checked={settings.autoRefresh}
                            onCheckedChange={(v) => updateSetting('autoRefresh', v)}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Confirm on drop"
                        description="Show confirmation before dropping a stash"
                    >
                        <Switch
                            checked={settings.confirmOnDrop}
                            onCheckedChange={(v) => updateSetting('confirmOnDrop', v)}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Confirm on clear"
                        description="Show confirmation before clearing all stashes"
                    >
                        <Switch
                            checked={settings.confirmOnClear}
                            onCheckedChange={(v) => updateSetting('confirmOnClear', v)}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Show file status"
                        description="Show M/A/D indicators on files"
                    >
                        <Switch
                            checked={settings.showFileStatus}
                            onCheckedChange={(v) => updateSetting('showFileStatus', v)}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Include untracked by default"
                        description="Include untracked files when creating a stash"
                    >
                        <Switch
                            checked={settings.defaultIncludeUntracked}
                            onCheckedChange={(v) => updateSetting('defaultIncludeUntracked', v)}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Sort order"
                        description="Order of stashes in the list"
                    >
                        <Select
                            value={settings.sortOrder}
                            onValueChange={(v) => updateSetting('sortOrder', v)}
                        >
                            <SelectTrigger className="w-[120px] h-7 text-[11px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">Newest first</SelectItem>
                                <SelectItem value="oldest">Oldest first</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Show branch in description"
                        description="Show branch name in stash tree items"
                    >
                        <Switch
                            checked={settings.showBranchInDescription}
                            onCheckedChange={(v) => updateSetting('showBranchInDescription', v)}
                        />
                    </SettingRow>
                </SectionCard>

                {/* ═══ Notes ═══ */}
                <SectionCard
                    icon={<StickyNote size={12} />}
                    title="Notes"
                >
                    <SettingRow
                        label="Autosave delay"
                        description="Seconds between auto-saves (5–300)"
                    >
                        <Input
                            type="number"
                            min={5}
                            max={300}
                            value={settings.autosaveDelay}
                            className="w-[80px] h-7 text-[11px] text-center"
                            onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v) && v >= 5 && v <= 300) {
                                    updateSetting('autosaveDelay', v);
                                }
                            }}
                        />
                    </SettingRow>
                    <Separator className="my-1" />
                    <SettingRow
                        label="Default visibility"
                        description="Visibility for newly created notes"
                    >
                        <Select
                            value={settings.defaultVisibility}
                            onValueChange={(v) => updateSetting('defaultVisibility', v)}
                        >
                            <SelectTrigger className="w-[120px] h-7 text-[11px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="secret">Secret</SelectItem>
                                <SelectItem value="public">Public</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                </SectionCard>

                {/* Footer spacer */}
                <div className="h-4" />
            </div>
        </ScrollArea>
    );
};
