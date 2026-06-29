'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { tools } from '@/config/tools';
import { getToolContent } from '@/config/tool-content';
import { ToolNodeData } from '@/types/workflow';
import * as LucideIcons from 'lucide-react';
import { Search, ChevronDown, ChevronRight, GripVertical, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Locale } from '@/lib/i18n/config';
import { WORKFLOW_TOOL_DROP_EVENT } from './dragEvents';

interface ToolSidebarProps {
    onDragStart: (event: React.DragEvent, nodeData: ToolNodeData) => void;
    onDragEnd?: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

interface CategoryGroup {
    id: string;
    name: string;
    icon: string;
    tools: typeof tools;
}

interface PointerDragState {
    pointerId: number;
    nodeData: ToolNodeData;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    hasMoved: boolean;
}

/**
 * Tool Sidebar for the workflow editor
 * Displays available tools grouped by category
 */
export function ToolSidebar({
    onDragStart,
    onDragEnd,
    isCollapsed = false,
    onToggleCollapse,
}: ToolSidebarProps) {
    const tWorkflow = useTranslations('workflow');
    const locale = useLocale() as Locale;

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(['organize-manage', 'convert-to-pdf'])
    );
    const pointerDragRef = useRef<PointerDragState | null>(null);

    // Format tool ID to human readable name
    const formatToolId = (id: string): string => {
        return id
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    // Helper function to get tool name with fallback using getToolContent
    const getToolName = (toolId: string): string => {
        const content = getToolContent(locale, toolId);
        if (content && content.title) {
            return content.title;
        }
        return formatToolId(toolId);
    };

    // Group tools by category
    const categories: CategoryGroup[] = useMemo(() => {
        const categoryMap: Record<string, typeof tools> = {};

        // Tools that require interactive UI and should be excluded from workflow
        const interactiveToolsBlacklist = new Set([
            'pdf-multi-tool',    // Interactive multi-tool
            'edit-pdf',          // Canvas editor required
            'sign-pdf',          // Signature drawing required
            'crop-pdf',          // Visual crop selection required
            'bookmark',          // Bookmark editing required
            'add-stamps',        // Position interaction required
            'form-filler',       // Form field interaction required
            'form-creator',      // Form design required
            'rotate-custom',     // Per-page rotation settings required
            'view-metadata',     // Read-only viewer tool
            'compare-pdfs',      // Visual comparison interface required
            'add-attachments',   // File selection for attachments required
            'edit-attachments',  // Attachment management interaction required
            'page-dimensions',   // Analysis only, no PDF output
            'validate-signature', // Read-only signature verification, no PDF output
            'pdf-to-docx',       // Workflow executor not yet implemented
            'pdf-to-pptx',       // Workflow executor not yet implemented
            'pdf-to-excel',      // Workflow executor not yet implemented
        ]);

        tools
            .filter(tool => !interactiveToolsBlacklist.has(tool.id))
            .forEach(tool => {
                if (!categoryMap[tool.category]) {
                    categoryMap[tool.category] = [];
                }
                categoryMap[tool.category].push(tool);
            });

        const categoryOrder = [
            'organize-manage',
            'edit-annotate',
            'convert-to-pdf',
            'convert-from-pdf',
            'optimize-repair',
            'secure-pdf',
        ];

        const categoryNames: Record<string, string> = {
            'organize-manage': 'Organize & Manage',
            'edit-annotate': 'Edit & Annotate',
            'convert-to-pdf': 'Convert to PDF',
            'convert-from-pdf': 'Convert from PDF',
            'optimize-repair': 'Optimize & Repair',
            'secure-pdf': 'Security & Privacy',
        };

        const categoryIcons: Record<string, string> = {
            'organize-manage': 'files',
            'edit-annotate': 'pencil',
            'convert-to-pdf': 'file-up',
            'convert-from-pdf': 'file-down',
            'optimize-repair': 'zap',
            'secure-pdf': 'shield',
        };

        return categoryOrder
            .filter(cat => categoryMap[cat])
            .map(cat => ({
                id: cat,
                name: categoryNames[cat],
                icon: categoryIcons[cat],
                tools: categoryMap[cat],
            }));
    }, []);

    // Filter tools based on search query
    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return categories;

        const query = searchQuery.toLowerCase();
        return categories
            .map(cat => ({
                ...cat,
                tools: cat.tools.filter(tool => {
                    const translatedName = getToolName(tool.id);
                    return (
                        tool.id.toLowerCase().includes(query) ||
                        translatedName.toLowerCase().includes(query)
                    );
                }),
            }))
            .filter(cat => cat.tools.length > 0);
    }, [categories, searchQuery]);

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    };

    const handleDragStart = (e: React.DragEvent, tool: typeof tools[0]) => {
        onDragStart(e, createNodeData(tool));
    };

    const createNodeData = (tool: typeof tools[0]): ToolNodeData => ({
        toolId: tool.id,
        label: getToolName(tool.id),
        icon: tool.icon,
        category: tool.category,
        acceptedFormats: tool.acceptedFormats,
        outputFormat: tool.outputFormat,
        status: 'idle',
        progress: 0,
    });

    const handlePointerDown = (e: React.PointerEvent, tool: typeof tools[0]) => {
        if (e.button !== 0) return;

        pointerDragRef.current = {
            pointerId: e.pointerId,
            nodeData: createNodeData(tool),
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            hasMoved: false,
        };
    };

    /**
     * Double-click adds the tool to the canvas center.
     * Dispatches the same event used by pointer-based fallback drops so that
     * WorkflowEditor places the node at the resolved screen coordinates.
     */
    const handleDoubleClick = (tool: typeof tools[0]) => {
        // Cancel any in-flight pointer drag intent so it does not race with the dblclick.
        pointerDragRef.current = null;

        const flowEl =
            (typeof document !== 'undefined'
                ? (document.querySelector('.react-flow') as HTMLElement | null)
                : null);

        let clientX: number;
        let clientY: number;
        if (flowEl) {
            const rect = flowEl.getBoundingClientRect();
            // Add a small random offset so consecutive double-clicks do not
            // perfectly stack the new nodes on top of each other.
            const jitter = () => (Math.random() - 0.5) * 80;
            clientX = rect.left + rect.width / 2 + jitter();
            clientY = rect.top + rect.height / 2 + jitter();
        } else if (typeof window !== 'undefined') {
            clientX = window.innerWidth / 2;
            clientY = window.innerHeight / 2;
        } else {
            return;
        }

        window.dispatchEvent(new CustomEvent(WORKFLOW_TOOL_DROP_EVENT, {
            detail: {
                nodeData: createNodeData(tool),
                clientX,
                clientY,
            },
        }));
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const dragState = pointerDragRef.current;
            if (!dragState || dragState.pointerId !== event.pointerId) return;

            dragState.lastX = event.clientX;
            dragState.lastY = event.clientY;
            if (
                Math.abs(event.clientX - dragState.startX) > 6 ||
                Math.abs(event.clientY - dragState.startY) > 6
            ) {
                dragState.hasMoved = true;
            }
        };

        const handlePointerUp = (event: PointerEvent) => {
            const dragState = pointerDragRef.current;
            if (!dragState || dragState.pointerId !== event.pointerId) return;

            pointerDragRef.current = null;
            if (!dragState.hasMoved) return;

            window.dispatchEvent(new CustomEvent(WORKFLOW_TOOL_DROP_EVENT, {
                detail: {
                    nodeData: dragState.nodeData,
                    clientX: event.clientX || dragState.lastX,
                    clientY: event.clientY || dragState.lastY,
                },
            }));
        };

        const handlePointerCancel = (event: PointerEvent) => {
            const dragState = pointerDragRef.current;
            if (dragState && dragState.pointerId === event.pointerId) {
                pointerDragRef.current = null;
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
        };
    }, []);

    // Get icon component dynamically
    const getIcon = (iconName: string) => {
        const pascalName = iconName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (LucideIcons as any)[pascalName] || LucideIcons.FileText;
    };

    // Collapsed view
    if (isCollapsed) {
        return (
            <div className="w-12 h-full bg-[hsl(var(--color-background))] border-r border-[hsl(var(--color-border))] flex flex-col items-center py-2">
                <button
                    onClick={onToggleCollapse}
                    className="p-2 rounded-lg hover:bg-[hsl(var(--color-muted))] transition-colors mb-2"
                    title={tWorkflow('toolbox') || 'Toolbox'}
                >
                    <PanelLeftOpen className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                </button>
                <div className="w-8 h-px bg-[hsl(var(--color-border))] mb-2" />
                {/* Show category icons when collapsed */}
                {categories.slice(0, 6).map(category => {
                    const CategoryIcon = getIcon(category.icon);
                    return (
                        <button
                            key={category.id}
                            onClick={onToggleCollapse}
                            className="p-2 rounded-lg hover:bg-[hsl(var(--color-muted))] transition-colors mb-1"
                            title={category.name}
                        >
                            <CategoryIcon className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="w-72 h-full bg-[hsl(var(--color-background))] border-r border-[hsl(var(--color-border))] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[hsl(var(--color-border))] flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-[hsl(var(--color-foreground))]">
                        {tWorkflow('toolbox') || 'Tool Box'}
                    </h2>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                        {tWorkflow('dragToAdd') || 'Drag or double-click a tool to add it to the workflow'}
                    </p>
                </div>
                <button
                    onClick={onToggleCollapse}
                    className="p-1.5 rounded-lg hover:bg-[hsl(var(--color-muted))] transition-colors"
                    title="Collapse sidebar"
                >
                    <PanelLeftClose className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-[hsl(var(--color-border))]">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                    <input
                        type="text"
                        placeholder={tWorkflow('searchTools') || 'Search tools...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] placeholder:text-[hsl(var(--color-muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                    />
                </div>
            </div>

            {/* Tools List */}
            <div className="flex-1 overflow-y-auto">
                {filteredCategories.map(category => {
                    const isExpanded = expandedCategories.has(category.id);
                    const CategoryIcon = getIcon(category.icon);

                    return (
                        <div key={category.id} className="border-b border-[hsl(var(--color-border))]">
                            {/* Category Header */}
                            <button
                                onClick={() => toggleCategory(category.id)}
                                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[hsl(var(--color-muted)/0.5)] transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                )}
                                <CategoryIcon className="w-4 h-4 text-[hsl(var(--color-primary))]" />
                                <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                                    {category.name}
                                </span>
                                <span className="ml-auto text-xs text-[hsl(var(--color-muted-foreground))]">
                                    {category.tools.length}
                                </span>
                            </button>

                            {/* Tools in Category */}
                            {isExpanded && (
                                <div className="pb-2">
                                    {category.tools.map(tool => {
                                        const ToolIcon = getIcon(tool.icon);

                                        const toolName = getToolName(tool.id);
                                        const hint = tWorkflow('addToWorkflowHint')
                                            || 'Drag or double-click to add to workflow';
                                        return (
                                            <div
                                                key={tool.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, tool)}
                                                onDragEnd={onDragEnd}
                                                onPointerDown={(e) => handlePointerDown(e, tool)}
                                                onDoubleClick={() => handleDoubleClick(tool)}
                                                title={`${toolName} \u2014 ${hint}`}
                                                className="flex items-center gap-2 px-4 py-2 mx-2 rounded-md cursor-grab hover:bg-[hsl(var(--color-muted))] active:cursor-grabbing transition-colors group select-none"
                                            >
                                                <GripVertical className="w-3 h-3 text-[hsl(var(--color-muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <ToolIcon className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                                <span className="text-sm text-[hsl(var(--color-foreground))] truncate flex-1">
                                                    {toolName}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.3)]">
                <p className="text-xs text-center text-[hsl(var(--color-muted-foreground))]">
                    {tools.length} {tWorkflow('toolsAvailable') || 'tools available'}
                </p>
            </div>
        </div>
    );
}

export default ToolSidebar;
