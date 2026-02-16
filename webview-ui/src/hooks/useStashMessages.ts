/**
 * useStashMessages — dispatches extension→webview stash messages to the store.
 *
 * Returns a handler function to be called from the central App message dispatcher.
 */
import { useStashStore, type StashData } from '../store';

type Msg = { type: string; [key: string]: unknown };

export function handleStashMessage(msg: Msg): boolean {
    const s = useStashStore.getState();

    switch (msg.type) {
        case 'stashData':
            s.setStashes(msg.payload as StashData[]);
            s.setLoading(false);
            return true;
        case 'loading':
            s.setLoading(true);
            return true;
        case 'fileDiff':
            s.setFileDiff(msg.key as string, msg.diff as string);
            return true;
        default:
            return false;
    }
}
