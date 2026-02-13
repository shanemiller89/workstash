import React, { useCallback } from 'react';
import { useIssueStore } from '../issueStore';
import { IssueList } from './IssueList';
import { IssueDetail } from './IssueDetail';
import { ResizableLayout } from './ResizableLayout';

export const IssuesTab: React.FC = () => {
    const selectedIssueNumber = useIssueStore((s) => s.selectedIssueNumber);
    const clearSelection = useIssueStore((s) => s.clearSelection);

    const handleCloseDetail = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const hasSelection = selectedIssueNumber !== null;

    return (
        <ResizableLayout
            storageKey="issues"
            hasSelection={hasSelection}
            backLabel="Back to Issues"
            onBack={handleCloseDetail}
            listContent={<IssueList />}
            detailContent={<IssueDetail onClose={handleCloseDetail} />}
        />
    );
};
