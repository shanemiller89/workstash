import React, { useEffect } from 'react';
import { useStashStore, type StashData } from './store';
import { onMessage, postMessage } from './vscode';
import { StashList } from './components/StashList';

export const App: React.FC = () => {
    useEffect(() => {
        const dispose = onMessage((msg) => {
            switch (msg.type) {
                case 'stashData':
                    useStashStore.getState().setStashes(msg.payload as StashData[]);
                    useStashStore.getState().setLoading(false);
                    break;
                case 'loading':
                    useStashStore.getState().setLoading(true);
                    break;
            }
        });

        // Request initial data
        postMessage('ready');

        return dispose;
    }, []);

    return (
        <div className="h-screen bg-bg text-fg text-[13px]">
            <StashList />
        </div>
    );
};
