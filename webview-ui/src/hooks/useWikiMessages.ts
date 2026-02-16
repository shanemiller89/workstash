/**
 * useWikiMessages — dispatches extension→webview Wiki messages to the store.
 */
import { useWikiStore, type WikiPageSummaryData, type WikiPageData } from '../wikiStore';

type Msg = { type: string; [key: string]: unknown };

export function handleWikiMessage(msg: Msg): boolean {
    const s = useWikiStore.getState();

    switch (msg.type) {
        case 'wikiPages':
            s.setPages(msg.pages as WikiPageSummaryData[]);
            s.setLoading(false);
            s.setNoWiki(false);
            s.setError(null);
            return true;
        case 'wikiPageContent':
            s.setSelectedPage(msg.page as WikiPageData);
            s.setPageLoading(false);
            return true;
        case 'wikiPageLoading':
            s.setPageLoading(true);
            return true;
        case 'wikiLoading':
            s.setLoading(true);
            s.setError(null);
            s.setNoWiki(false);
            s.setAuthRequired(false);
            return true;
        case 'wikiNoWiki':
            s.setNoWiki(true);
            s.setLoading(false);
            return true;
        case 'wikiAuthRequired':
            s.setAuthRequired(true);
            s.setLoading(false);
            return true;
        case 'wikiError':
            s.setError(msg.message as string);
            s.setLoading(false);
            s.setPageLoading(false);
            return true;
        default:
            return false;
    }
}
