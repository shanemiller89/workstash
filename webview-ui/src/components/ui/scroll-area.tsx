import * as React from 'react';

import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.ComponentProps<'div'> {
    orientation?: 'vertical' | 'horizontal' | 'both';
}

function ScrollArea({
    className,
    orientation = 'vertical',
    children,
    ...props
}: ScrollAreaProps) {
    return (
        <div
            className={cn(
                'relative min-h-0 min-w-0',
                orientation === 'vertical' && 'overflow-y-auto overflow-x-hidden',
                orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
                orientation === 'both' && 'overflow-auto',
                // Thin scrollbar styling
                '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5',
                '[&::-webkit-scrollbar-track]:bg-transparent',
                '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-fg/20',
                '[&::-webkit-scrollbar-thumb:hover]:bg-fg/30',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
}

export { ScrollArea };
