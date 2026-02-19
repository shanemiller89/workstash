/**
 * useSettingsMessages — dispatches extension→webview settings messages to the store.
 */
import { useSettingsStore, type SettingsData } from './store';

type Msg = { type: string; [key: string]: unknown };

export function handleSettingsMessage(msg: Msg): boolean {
    switch (msg.type) {
        case 'settingsData': {
            const s = useSettingsStore.getState();
            s.setSettings(msg.settings as SettingsData);
            return true;
        }
        case 'settingsOrgs': {
            const s = useSettingsStore.getState();
            s.setOrgs(msg.orgs as { login: string; avatarUrl: string; name: string | null }[]);
            return true;
        }
        default:
            return false;
    }
}
