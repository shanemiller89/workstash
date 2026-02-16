import React from 'react';
import { usePRStore, type PRReviewData } from '../prStore';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import {
    CheckCircle2,
    XCircle,
    MessageSquare,
    Clock,
    MinusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const reviewStateConfig: Record<string, {
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
}> = {
    APPROVED: {
        icon: <CheckCircle2 size={10} />,
        label: 'Approved',
        color: 'text-green-400',
        bg: 'bg-green-400/10 border-green-400/30',
    },
    CHANGES_REQUESTED: {
        icon: <XCircle size={10} />,
        label: 'Changes requested',
        color: 'text-red-400',
        bg: 'bg-red-400/10 border-red-400/30',
    },
    COMMENTED: {
        icon: <MessageSquare size={10} />,
        label: 'Commented',
        color: 'text-fg/50',
        bg: 'bg-fg/5 border-fg/15',
    },
    DISMISSED: {
        icon: <MinusCircle size={10} />,
        label: 'Dismissed',
        color: 'text-fg/30',
        bg: 'bg-fg/5 border-fg/10',
    },
    PENDING: {
        icon: <Clock size={10} />,
        label: 'Pending',
        color: 'text-yellow-400',
        bg: 'bg-yellow-400/10 border-yellow-400/30',
    },
};

/** Deduplicate reviews: keep only the latest review per user, excluding COMMENTED */
function deduplicateReviews(reviews: PRReviewData[]): PRReviewData[] {
    const latestByUser = new Map<string, PRReviewData>();

    // Sorted oldest first so latest overwrites
    const sorted = [...reviews].sort(
        (a, b) => new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime(),
    );

    for (const review of sorted) {
        // Skip pure comments — they don't indicate a review state
        if (review.state === 'COMMENTED') { continue; }
        latestByUser.set(review.user, review);
    }

    return [...latestByUser.values()];
}

export const PRReviewStatus: React.FC = () => {
    const reviews = usePRStore((s) => s.reviews);

    const dedupedReviews = React.useMemo(() => deduplicateReviews(reviews), [reviews]);

    if (dedupedReviews.length === 0) { return null; }

    // Summary counts
    const approved = dedupedReviews.filter((r) => r.state === 'APPROVED').length;
    const changesRequested = dedupedReviews.filter((r) => r.state === 'CHANGES_REQUESTED').length;

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {/* Summary badge */}
            {changesRequested > 0 ? (
                <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0.5 gap-0.5 border-red-400/30 text-red-400 bg-red-400/10"
                >
                    <XCircle size={8} />
                    {changesRequested} change{changesRequested !== 1 ? 's' : ''} requested
                </Badge>
            ) : approved > 0 ? (
                <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0.5 gap-0.5 border-green-400/30 text-green-400 bg-green-400/10"
                >
                    <CheckCircle2 size={8} />
                    {approved} approved
                </Badge>
            ) : null}

            {/* Individual reviewer badges */}
            <TooltipProvider>
                {dedupedReviews.map((review) => {
                    const cfg = reviewStateConfig[review.state] ?? reviewStateConfig.PENDING;
                    return (
                        <Tooltip key={review.id}>
                            <TooltipTrigger
                                className={cn(
                                    'flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] cursor-default',
                                    cfg.bg,
                                    cfg.color,
                                )}
                            >
                                {review.userAvatarUrl ? (
                                    <img
                                        src={review.userAvatarUrl}
                                        alt={review.user}
                                        className="w-3 h-3 rounded-full"
                                    />
                                ) : (
                                    cfg.icon
                                )}
                                <span className="font-medium">{review.user}</span>
                                {cfg.icon}
                            </TooltipTrigger>
                            <TooltipContent>
                                <span>
                                    {review.user}: {cfg.label}
                                    {review.submittedAt && (
                                        <> · {new Date(review.submittedAt).toLocaleString()}</>
                                    )}
                                </span>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </TooltipProvider>
        </div>
    );
};
