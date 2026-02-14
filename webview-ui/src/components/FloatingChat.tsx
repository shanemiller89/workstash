import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useAIStore, type AIModelInfo } from '../aiStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import {
    InputGroup,
    InputGroupTextarea,
    InputGroupAddon,
    InputGroupButton,
} from './ui/input-group';
import { MarkdownBody } from './MarkdownBody';
import {
    Send,
    Trash2,
    Loader2,
    Bot,
    User,
    X,
    Minus,
    GripVertical,
    ChevronDown,
    Cpu,
    Copy,
    Check,
    Globe,
} from 'lucide-react';

// ─── Chat Bubble ──────────────────────────────────────────────────

const ChatBubble: React.FC<{
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
}> = React.memo(({ role, content, isStreaming }) => {
    const isUser = role === 'user';
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [content]);

    return (
        <div className={`group/bubble flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
            <div
                className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                    isUser
                        ? 'bg-accent/20 text-accent'
                        : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
                }`}
            >
                {isUser ? <User size={10} /> : <Bot size={10} />}
            </div>
            <div
                className={`relative flex-1 min-w-0 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                    isUser
                        ? 'bg-accent/10 text-fg'
                        : 'bg-[var(--vscode-editor-background)] text-fg/90 border border-border'
                }`}
            >
                {role === 'assistant' ? (
                    <MarkdownBody content={content || (isStreaming ? '…' : '')} className="text-[11px]" />
                ) : (
                    <span>{content}</span>
                )}
                {isStreaming && content && (
                    <span className="inline-block w-1.5 h-3 bg-accent/60 ml-0.5 animate-pulse" />
                )}
                {/* Copy button — visible on hover */}
                {content && !isStreaming && (
                    <button
                        type="button"
                        className={`absolute top-1 right-1 p-0.5 rounded transition-opacity ${
                            copied
                                ? 'opacity-100 text-green-500'
                                : 'opacity-0 group-hover/bubble:opacity-100 text-fg/40 hover:text-fg/70'
                        }`}
                        onClick={handleCopy}
                        title="Copy message"
                    >
                        {copied ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                )}
            </div>
        </div>
    );
});
ChatBubble.displayName = 'ChatBubble';

// ─── Persisted position/size ──────────────────────────────────────

interface PanelGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

const DEFAULT_GEOMETRY: PanelGeometry = { x: -1, y: -1, width: 380, height: 480 };

function getPersistedGeometry(): PanelGeometry {
    try {
        const raw = localStorage.getItem('workstash-chat-geometry');
        if (raw) {
            return JSON.parse(raw) as PanelGeometry;
        }
    } catch { /* ignore */ }
    return { ...DEFAULT_GEOMETRY };
}

function persistGeometry(geo: PanelGeometry): void {
    try {
        localStorage.setItem('workstash-chat-geometry', JSON.stringify(geo));
    } catch { /* ignore */ }
}

// ─── Floating Chat Panel ──────────────────────────────────────────

export const FloatingChat: React.FC = () => {
    const chatMessages = useAIStore((s) => s.chatMessages);
    const chatInput = useAIStore((s) => s.chatInput);
    const setChatInput = useAIStore((s) => s.setChatInput);
    const isChatLoading = useAIStore((s) => s.isChatLoading);
    const clearChat = useAIStore((s) => s.clearChat);
    const setChatPanelOpen = useAIStore((s) => s.setChatPanelOpen);
    const availableModels = useAIStore((s) => s.availableModels);
    const modelAssignments = useAIStore((s) => s.modelAssignments);
    const webSearchEnabled = useAIStore((s) => s.webSearchEnabled);
    const setWebSearchEnabled = useAIStore((s) => s.setWebSearchEnabled);
    const aiProvider = useAIStore((s) => s.aiProvider);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [minimized, setMinimized] = useState(false);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);

    // Fetch models on mount if not already loaded
    useEffect(() => {
        if (availableModels.length === 0) {
            postMessage('ai.listModels');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Position & size state
    const [geo, setGeo] = useState<PanelGeometry>(() => {
        const saved = getPersistedGeometry();
        // If no saved position, we'll center it in componentDidMount
        return saved;
    });

    // Center on first render if no saved position
    useEffect(() => {
        if (geo.x === -1 && geo.y === -1) {
            const parent = panelRef.current?.parentElement;
            if (parent) {
                const pr = parent.getBoundingClientRect();
                const x = Math.max(10, pr.width - geo.width - 20);
                const y = Math.max(10, pr.height - geo.height - 20);
                const newGeo = { ...geo, x, y };
                setGeo(newGeo);
                persistGeometry(newGeo);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // ─── Drag logic ───────────────────────────────────────────
    const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            originX: geo.x,
            originY: geo.y,
        };

        const handleDragMove = (ev: MouseEvent) => {
            if (!dragRef.current) { return; }
            const dx = ev.clientX - dragRef.current.startX;
            const dy = ev.clientY - dragRef.current.startY;
            const newGeo = {
                ...geo,
                x: Math.max(0, dragRef.current.originX + dx),
                y: Math.max(0, dragRef.current.originY + dy),
            };
            setGeo(newGeo);
        };

        const handleDragEnd = () => {
            if (dragRef.current) {
                setGeo((cur) => {
                    persistGeometry(cur);
                    return cur;
                });
                dragRef.current = null;
            }
            document.removeEventListener('mousemove', handleDragMove);
            document.removeEventListener('mouseup', handleDragEnd);
        };

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }, [geo]);

    // ─── Resize logic ─────────────────────────────────────────
    const resizeRef = useRef<{ startX: number; startY: number; originW: number; originH: number } | null>(null);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            originW: geo.width,
            originH: geo.height,
        };

        const handleResizeMove = (ev: MouseEvent) => {
            if (!resizeRef.current) { return; }
            const dw = ev.clientX - resizeRef.current.startX;
            const dh = ev.clientY - resizeRef.current.startY;
            const newGeo = {
                ...geo,
                width: Math.max(280, resizeRef.current.originW + dw),
                height: Math.max(200, resizeRef.current.originH + dh),
            };
            setGeo(newGeo);
        };

        const handleResizeEnd = () => {
            if (resizeRef.current) {
                setGeo((cur) => {
                    persistGeometry(cur);
                    return cur;
                });
                resizeRef.current = null;
            }
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    }, [geo]);

    // Reset textarea height when input is cleared (e.g. after send)
    useEffect(() => {
        if (!chatInput && inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
    }, [chatInput]);

    // ─── Chat actions ─────────────────────────────────────────
    const handleSend = useCallback(() => {
        const text = chatInput.trim();
        if (!text || isChatLoading) {
            return;
        }
        const currentMessages = useAIStore.getState().chatMessages;
        const history = currentMessages
            .filter((m) => !m.isStreaming)
            .map((m) => ({ role: m.role, content: m.content }));
        useAIStore.getState().addUserMessage(text);
        postMessage('ai.chat', { question: text, history, webSearch: webSearchEnabled });
    }, [chatInput, isChatLoading, webSearchEnabled]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    const handleClose = useCallback(() => {
        setChatPanelOpen(false);
    }, [setChatPanelOpen]);

    const handleMinimize = useCallback(() => {
        setMinimized((prev) => !prev);
    }, []);

    const handleSetChatModel = useCallback((modelId: string) => {
        postMessage('ai.setModel', { purpose: 'chat', modelId });
        setModelPickerOpen(false);
    }, []);

    const currentChatModelId = modelAssignments['chat'] ?? '';
    const currentChatModel = availableModels.find((m) => m.id === currentChatModelId);
    const chatModelLabel = currentChatModel?.name ?? 'Auto';

    // Don't render if position not yet computed
    if (geo.x === -1 && geo.y === -1) {
        return <div ref={panelRef} className="hidden" />;
    }

    return (
        <div
            ref={panelRef}
            className="absolute z-50 flex flex-col rounded-lg border border-border shadow-xl bg-[var(--vscode-sideBar-background)] overflow-hidden"
            style={{
                left: geo.x,
                top: geo.y,
                width: geo.width,
                height: minimized ? 'auto' : geo.height,
            }}
        >
            {/* ── Title bar (draggable) ── */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-border cursor-move select-none flex-shrink-0 bg-[var(--vscode-titleBar-activeBackground)]"
                onMouseDown={handleDragStart}
            >
                <GripVertical size={12} className="text-fg/30 flex-shrink-0" />
                <Bot size={12} className="text-accent flex-shrink-0" />
                <span className="text-[11px] font-semibold text-fg/70 flex-1">
                    AI Chat
                    {aiProvider === 'gemini' && (
                        <span className="ml-1.5 text-[9px] font-normal text-fg/40">Gemini</span>
                    )}
                </span>
                {chatMessages.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={clearChat}
                        title="Clear chat"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <Trash2 size={10} />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleMinimize}
                    title={minimized ? 'Expand' : 'Minimize'}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <Minus size={10} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleClose}
                    title="Close chat"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <X size={10} />
                </Button>
            </div>

            {!minimized && (
                <>
                    {/* ── Messages ── */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                        {chatMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
                                <Bot size={24} className="text-fg/15" />
                                <p className="text-[11px] text-fg/30 max-w-[220px]">
                                    Ask me about your PRs, issues, stashes, projects, notes, or Mattermost messages
                                </p>
                                <div className="flex flex-col gap-1 mt-2 w-full max-w-[240px]">
                                    {[
                                        'What PRs need my review?',
                                        'Summarize open issues',
                                        'Any unread messages?',
                                    ].map((q) => (
                                        <Button
                                            key={q}
                                            variant="outline"
                                            size="sm"
                                            className="h-auto px-2.5 py-1.5 text-[10px] text-left justify-start"
                                            onClick={() => {
                                                useAIStore.getState().addUserMessage(q);
                                                postMessage('ai.chat', { question: q, history: [], webSearch: webSearchEnabled });
                                            }}
                                        >
                                            {q}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 p-3">
                                {chatMessages.map((msg) => (
                                    <ChatBubble
                                        key={msg.id}
                                        role={msg.role}
                                        content={msg.content}
                                        isStreaming={msg.isStreaming}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Input ── */}
                    <div className="flex-shrink-0 border-t border-border p-2">
                        <InputGroup className="h-auto">
                            <InputGroupTextarea
                                ref={inputRef}
                                value={chatInput}
                                onChange={(e) => {
                                    setChatInput(e.target.value);
                                    // Auto-grow textarea
                                    const el = e.target;
                                    el.style.height = 'auto';
                                    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about your workspace…"
                                className="text-[11px] min-h-[32px] max-h-[240px] resize-none py-1.5 px-2.5"
                                rows={1}
                                disabled={isChatLoading}
                            />
                            <InputGroupAddon align="block-end" className="px-2 pb-1.5 pt-0 justify-between">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 text-[9px] text-fg/40 hover:text-fg/70 transition-colors"
                                        onClick={() => setModelPickerOpen(!modelPickerOpen)}
                                    >
                                        <Cpu size={9} />
                                        <span>{chatModelLabel}</span>
                                        <ChevronDown size={8} />
                                    </button>
                                    {aiProvider === 'copilot' && (
                                    <button
                                        type="button"
                                        className={`inline-flex items-center gap-1 text-[9px] transition-colors ${
                                            webSearchEnabled
                                                ? 'text-accent'
                                                : 'text-fg/40 hover:text-fg/70'
                                        }`}
                                        onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                                        title={webSearchEnabled ? 'Web search enabled' : 'Enable web search'}
                                    >
                                        <Globe size={9} />
                                        <span>Web</span>
                                    </button>
                                    )}
                                </div>
                                <InputGroupButton
                                    variant="default"
                                    size="icon-xs"
                                    onClick={handleSend}
                                    disabled={!chatInput.trim() || isChatLoading}
                                    title="Send"
                                >
                                    {isChatLoading ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Send size={12} />
                                    )}
                                </InputGroupButton>
                            </InputGroupAddon>
                        </InputGroup>
                        {/* Model picker dropdown */}
                        {modelPickerOpen && (
                            <div className="mt-1 border border-border rounded-md bg-[var(--vscode-editor-background)] p-1.5 max-h-[120px] overflow-y-auto">
                                <button
                                    className={`w-full text-left px-2 py-1 rounded text-[9px] transition-colors ${
                                        !currentChatModelId
                                            ? 'bg-accent/15 text-fg'
                                            : 'text-fg/50 hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    onClick={() => handleSetChatModel('')}
                                >
                                    Auto (gpt-4o)
                                </button>
                                {availableModels.map((m) => (
                                    <button
                                        key={m.id}
                                        className={`w-full text-left px-2 py-1 rounded text-[9px] transition-colors ${
                                            currentChatModelId === m.id
                                                ? 'bg-accent/15 text-fg'
                                                : 'text-fg/50 hover:bg-[var(--vscode-list-hoverBackground)]'
                                        }`}
                                        onClick={() => handleSetChatModel(m.id)}
                                    >
                                        {m.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Resize handle (bottom-right corner) ── */}
                    <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                        onMouseDown={handleResizeStart}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            className="text-fg/20"
                        >
                            <path
                                d="M14 14L8 14L14 8Z"
                                fill="currentColor"
                            />
                        </svg>
                    </div>
                </>
            )}
        </div>
    );
};
