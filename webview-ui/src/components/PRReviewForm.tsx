import React, { useState, useCallback } from 'react';
import { usePRStore, type PRReviewEvent } from '../prStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from './ui/dialog';
import {
    CheckCircle2,
    XCircle,
    MessageSquare,
    Loader2,
    Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const reviewOptions: { value: PRReviewEvent; label: string; description: string; icon: React.ReactNode; color: string }[] = [
    {
        value: 'APPROVE',
        label: 'Approve',
        description: 'Submit feedback and approve merging',
        icon: <CheckCircle2 size={14} />,
        color: 'text-green-400 border-green-400/30 bg-green-400/10 data-[selected=true]:border-green-400',
    },
    {
        value: 'REQUEST_CHANGES',
        label: 'Request changes',
        description: 'Submit feedback that must be addressed',
        icon: <XCircle size={14} />,
        color: 'text-red-400 border-red-400/30 bg-red-400/10 data-[selected=true]:border-red-400',
    },
    {
        value: 'COMMENT',
        label: 'Comment',
        description: 'Submit general feedback',
        icon: <MessageSquare size={14} />,
        color: 'text-fg/60 border-fg/20 bg-fg/5 data-[selected=true]:border-fg/50',
    },
];

interface PRReviewFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prNumber: number;
}

export const PRReviewForm: React.FC<PRReviewFormProps> = ({ open, onOpenChange, prNumber }) => {
    const pendingComments = usePRStore((s) => s.pendingReviewComments);
    const clearPendingComments = usePRStore((s) => s.clearPendingComments);
    const isSubmitting = usePRStore((s) => s.isSubmittingReview);
    const reviewError = usePRStore((s) => s.reviewError);

    const [event, setEvent] = useState<PRReviewEvent>('COMMENT');
    const [body, setBody] = useState('');

    const handleSubmit = useCallback(() => {
        postMessage('prs.submitReview', {
            prNumber,
            event,
            body: body.trim() || undefined,
            comments: pendingComments.length > 0 ? pendingComments : undefined,
        });
        // Clear pending after submission attempt
        clearPendingComments();
        setBody('');
        setEvent('COMMENT');
        onOpenChange(false);
    }, [prNumber, event, body, pendingComments, clearPendingComments, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Submit Review</DialogTitle>
                    <DialogDescription>
                        Review PR #{prNumber}
                    </DialogDescription>
                </DialogHeader>

                {/* Review type selector */}
                <div className="flex flex-col gap-2">
                    {reviewOptions.map((opt) => (
                        <div
                            key={opt.value}
                            data-selected={event === opt.value}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors',
                                opt.color,
                                event !== opt.value && 'opacity-60 hover:opacity-80',
                            )}
                            onClick={() => setEvent(opt.value)}
                            role="radio"
                            aria-checked={event === opt.value}
                        >
                            {opt.icon}
                            <div className="flex-1">
                                <div className="text-[12px] font-medium">{opt.label}</div>
                                <div className="text-[10px] opacity-60">{opt.description}</div>
                            </div>
                            <div
                                className={cn(
                                    'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                                    event === opt.value
                                        ? 'border-current'
                                        : 'border-fg/20',
                                )}
                            >
                                {event === opt.value && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Review body */}
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={
                        event === 'APPROVE'
                            ? 'Leave an optional comment…'
                            : event === 'REQUEST_CHANGES'
                              ? 'Describe the changes you\'d like to see…'
                              : 'Write your review comment…'
                    }
                    rows={4}
                    className="text-[11px]"
                />

                {/* Pending inline comments summary */}
                {pendingComments.length > 0 && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-yellow-400/30 bg-yellow-400/[0.05] text-[11px]">
                        <MessageSquare size={12} className="text-yellow-400 shrink-0" />
                        <span className="text-fg/70">
                            {pendingComments.length} inline comment{pendingComments.length !== 1 ? 's' : ''} will be included
                        </span>
                        <Badge
                            variant="outline"
                            className="ml-auto text-[9px] px-1.5 py-0 border-yellow-400/30 text-yellow-400 bg-yellow-400/10"
                        >
                            Pending
                        </Badge>
                    </div>
                )}

                {/* Error message */}
                {reviewError && (
                    <div className="text-[11px] text-red-400 px-1">
                        {reviewError}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={isSubmitting || (event === 'REQUEST_CHANGES' && !body.trim() && pendingComments.length === 0)}
                        className={cn(
                            'gap-1',
                            event === 'APPROVE' && 'bg-green-600 hover:bg-green-700 text-white',
                            event === 'REQUEST_CHANGES' && 'bg-red-600 hover:bg-red-700 text-white',
                        )}
                    >
                        {isSubmitting ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Send size={12} />
                        )}
                        {event === 'APPROVE'
                            ? 'Approve'
                            : event === 'REQUEST_CHANGES'
                              ? 'Request changes'
                              : 'Comment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
