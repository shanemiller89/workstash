import React, { useMemo } from 'react';

interface DiffLine {
    type: 'add' | 'del' | 'context' | 'hunk' | 'header';
    content: string;
    oldLineNo?: number;
    newLineNo?: number;
}

function parseDiff(raw: string): DiffLine[] {
    if (!raw.trim()) return [];

    const lines = raw.split('\n');
    const result: DiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
        // Skip diff header lines (diff --git, index, ---, +++)
        if (
            line.startsWith('diff --git') ||
            line.startsWith('index ') ||
            line.startsWith('---') ||
            line.startsWith('+++')
        ) {
            continue;
        }

        // Hunk header
        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
            oldLine = match ? parseInt(match[1], 10) : 0;
            newLine = match ? parseInt(match[2], 10) : 0;
            const context = match?.[3]?.trim() ?? '';
            result.push({ type: 'hunk', content: context ? `@@ ${context}` : '@@' });
            continue;
        }

        if (line.startsWith('+')) {
            result.push({ type: 'add', content: line.slice(1), newLineNo: newLine });
            newLine++;
        } else if (line.startsWith('-')) {
            result.push({ type: 'del', content: line.slice(1), oldLineNo: oldLine });
            oldLine++;
        } else if (line.startsWith(' ') || line === '') {
            result.push({
                type: 'context',
                content: line.slice(1) || '',
                oldLineNo: oldLine,
                newLineNo: newLine,
            });
            oldLine++;
            newLine++;
        }
        // Skip \ No newline at end of file
    }

    return result;
}

export const DiffView: React.FC<{ diff: string }> = ({ diff }) => {
    const lines = useMemo(() => parseDiff(diff), [diff]);

    if (lines.length === 0) {
        return (
            <div className="text-[11px] opacity-40 px-3 py-2 italic">No diff content available</div>
        );
    }

    // Calculate gutter width based on max line number
    const maxLineNo = lines.reduce((max, l) => {
        return Math.max(max, l.oldLineNo ?? 0, l.newLineNo ?? 0);
    }, 0);
    const gutterWidth = Math.max(String(maxLineNo).length, 3);

    return (
        <div className="text-[11px] font-mono leading-[18px] overflow-x-auto">
            {lines.map((line, i) => {
                if (line.type === 'hunk') {
                    return (
                        <div
                            key={i}
                            className="bg-accent/10 text-accent px-3 py-0.5 text-[10px] select-none border-y border-border/30"
                        >
                            {line.content}
                        </div>
                    );
                }

                const bgClass =
                    line.type === 'add'
                        ? 'bg-added/10'
                        : line.type === 'del'
                          ? 'bg-deleted/10'
                          : '';

                const textClass =
                    line.type === 'add'
                        ? 'text-added'
                        : line.type === 'del'
                          ? 'text-deleted'
                          : 'text-fg';

                const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';

                const oldNo =
                    line.oldLineNo !== undefined
                        ? String(line.oldLineNo).padStart(gutterWidth)
                        : ' '.repeat(gutterWidth);
                const newNo =
                    line.newLineNo !== undefined
                        ? String(line.newLineNo).padStart(gutterWidth)
                        : ' '.repeat(gutterWidth);

                return (
                    <div key={i} className={`flex ${bgClass}`}>
                        <span
                            className="opacity-30 select-none pr-1 pl-2 text-right shrink-0"
                            style={{ minWidth: `${gutterWidth + 1}ch` }}
                        >
                            {line.type === 'del' ? oldNo : line.type === 'add' ? '' : oldNo}
                        </span>
                        <span
                            className="opacity-30 select-none pr-2 text-right shrink-0"
                            style={{ minWidth: `${gutterWidth + 1}ch` }}
                        >
                            {line.type === 'add' ? newNo : line.type === 'del' ? '' : newNo}
                        </span>
                        <span
                            className={`opacity-50 select-none w-3 shrink-0 text-center ${textClass}`}
                        >
                            {prefix}
                        </span>
                        <span className={`${textClass} whitespace-pre`}>{line.content}</span>
                    </div>
                );
            })}
        </div>
    );
};
