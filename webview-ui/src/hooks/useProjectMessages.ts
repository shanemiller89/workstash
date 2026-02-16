/**
 * useProjectMessages — dispatches extension→webview project messages to the store.
 */
import { useProjectStore, type ProjectItemData, type ProjectData, type ProjectSummary } from '../projectStore';
import { useAppStore } from '../appStore';

type Msg = { type: string; [key: string]: unknown };

export function handleProjectMessage(msg: Msg): boolean {
    const s = useProjectStore.getState();

    switch (msg.type) {
        case 'projectsLoading':
            s.setLoading(true);
            return true;
        case 'projectsItemsLoading':
            s.setItemsLoading(true);
            return true;
        case 'projectsRepoNotFound':
            s.setRepoNotFound(true);
            return true;
        case 'projectsAvailable':
            s.setAvailableProjects(msg.payload as ProjectSummary[]);
            return true;
        case 'projectData':
            s.setSelectedProject(msg.payload as ProjectData);
            return true;
        case 'projectItemsData':
            s.setItems(msg.payload as ProjectItemData[]);
            return true;
        case 'projectFieldUpdated':
            s.setFieldUpdating(false);
            return true;
        case 'projectFieldUpdating':
            s.setFieldUpdating(true);
            return true;
        case 'projectItemDeleted':
            s.removeItem(msg.itemId as string);
            return true;
        case 'projectItemAdded':
            s.addItem(msg.item as ProjectItemData);
            return true;
        case 'projectError':
            s.setError(msg.message as string ?? 'An error occurred');
            s.setItemsLoading(false);
            s.setFieldUpdating(false);
            return true;

        // ─── Deep-link: open a specific project item ───
        case 'openProjectItem':
            useAppStore.getState().setActiveTab('projects');
            if (msg.itemId) {
                s.selectItem(msg.itemId as string);
            }
            return true;

        default:
            return false;
    }
}
