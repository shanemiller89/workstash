import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorStateProps {
    /** Error message to display */
    message: string;
    /** Optional retry callback — shows a Retry button when provided */
    onRetry?: () => void;
}

/**
 * Reusable error state for list views.
 * Renders an icon, the error message, and an optional retry button.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-8 gap-3 px-4 text-center">
            <AlertTriangle size={24} className="text-yellow-400" />
            <p className="text-fg/60 text-[11px] max-w-xs">{message}</p>
            {onRetry && (
                <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] gap-1.5"
                    onClick={onRetry}
                >
                    <RotateCcw size={10} />
                    Retry
                </Button>
            )}
        </div>
    );
}
