/**
 * useAppMessages — dispatches extension→webview repo-context messages to appStore.
 */
import { useAppStore, type RepoInfo, type AvailableRepo, type RepoGroup } from '../appStore';

type Msg = { type: string; [key: string]: unknown };

export function handleAppMessage(msg: Msg): boolean {
    const s = useAppStore.getState();

    switch (msg.type) {
        case 'repoContext':
            s.setRepoContext(
                (msg.current as RepoInfo) ?? null,
                (msg.repos as AvailableRepo[]) ?? [],
            );
            return true;
        case 'repoGroups':
            s.setRepoGroups(msg.payload as RepoGroup[]);
            return true;
        case 'repoGroupsLoading':
            s.setRepoGroupsLoading(true);
            return true;
        default:
            return false;
    }
}
