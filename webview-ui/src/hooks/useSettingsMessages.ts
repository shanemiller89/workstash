/**
 * useSettingsMessages — dispatches extension→webview settings messages to the store.
 */
import { useSettingsStore, type SettingsData } from '../settingsStore';

type Msg = { type: string; [key: string]: unknown };

export function handleSettingsMessage(msg: Msg): boolean {
    switch (msg.type) {
        case 'settingsData': {
            const s = useSettingsStore.getState();
            s.setSettings(msg.settings as SettingsData);
            return true;
        }
        default:
            return false;
    }
}
