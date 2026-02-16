import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({
    className,
    ...props
}: React.ComponentProps<'textarea'>) {
    return (
        <textarea
            className={cn(
                'flex min-h-15 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-colors',
                'border-[var(--vscode-input-border,transparent)] bg-[var(--vscode-input-background)]',
                'text-[var(--vscode-input-foreground)] placeholder:text-fg/40',
                'focus-visible:outline-none focus-visible:border-[var(--vscode-focusBorder)] focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'resize-none',
                className,
            )}
            {...props}
        />
    );
}

export { Textarea };
