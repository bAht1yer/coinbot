'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from './ui/badge';
import { Server, CheckCircle, XCircle, Clock, AlertTriangle, Zap } from 'lucide-react';

interface SystemLog {
    id: string;
    timestamp: string;
    level: string;
    source: string;
    message: string;
}

export function ServerLogs() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch logs from database
    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/logs?limit=50');
            if (response.ok) {
                const data = await response.json();
                setLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch and polling
    useEffect(() => {
        fetchLogs();

        // Poll every 5 seconds for new logs
        const interval = setInterval(fetchLogs, 5000);

        return () => clearInterval(interval);
    }, [fetchLogs]);

    const clearLogs = async () => {
        try {
            await fetch('/api/logs', { method: 'DELETE' });
            setLogs([]);
        } catch (error) {
            console.error('Failed to clear logs:', error);
        }
    };

    const getStatusIcon = (level: string) => {
        switch (level) {
            case 'success':
                return <CheckCircle className="w-3 h-3 text-emerald-400" />;
            case 'error':
                return <XCircle className="w-3 h-3 text-red-400" />;
            case 'warn':
                return <AlertTriangle className="w-3 h-3 text-amber-400" />;
            case 'info':
            default:
                return <Zap className="w-3 h-3 text-blue-400" />;
        }
    };

    const getStatusColor = (level: string) => {
        switch (level) {
            case 'success':
                return 'text-emerald-400';
            case 'error':
                return 'text-red-400';
            case 'warn':
                return 'text-amber-400';
            case 'info':
            default:
                return 'text-zinc-300';
        }
    };

    const getSourceColor = (source: string) => {
        switch (source) {
            case 'worker':
                return 'border-blue-500/50 text-blue-400';
            case 'trade':
                return 'border-emerald-500/50 text-emerald-400';
            case 'system':
                return 'border-purple-500/50 text-purple-400';
            case 'strategy':
                return 'border-cyan-500/50 text-cyan-400';
            case 'risk':
                return 'border-amber-500/50 text-amber-400';
            default:
                return 'border-zinc-600 text-zinc-400';
        }
    };

    return (
        <>
            {/* Collapsed Side Button */}
            {!isExpanded && (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="fixed right-0 top-1/2 -translate-y-1/2 bg-zinc-900/90 backdrop-blur-sm border border-l-0 border-zinc-700 rounded-l-lg p-3 hover:bg-zinc-800/90 transition-all z-40 shadow-lg group"
                >
                    <div className="flex flex-col items-center gap-1">
                        <Server className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider writing-mode-vertical">
                            Logs
                        </span>
                        {logs.length > 0 && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded">
                                {logs.length}
                            </span>
                        )}
                    </div>
                </button>
            )}

            {/* Expanded Side Panel */}
            {isExpanded && (
                <>
                    {/* Side Panel - No backdrop, slides over content */}
                    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-zinc-950 border-l border-zinc-800 z-50 shadow-2xl overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                                <h3 className="text-base sm:text-lg font-bold text-white">Worker Logs</h3>
                                {isLoading && (
                                    <span className="text-xs text-zinc-500 animate-pulse">syncing...</span>
                                )}
                            </div>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Controls */}
                        <div className="p-2 sm:p-3 border-b border-zinc-800 flex gap-2">
                            <button
                                onClick={fetchLogs}
                                disabled={isLoading}
                                className="flex-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-medium text-white transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Loading...' : 'Refresh'}
                            </button>
                            <button
                                onClick={clearLogs}
                                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                            >
                                Clear
                            </button>
                        </div>

                        {/* Logs List */}
                        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                            {logs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-2">
                                    <Server className="w-8 h-8 opacity-30" />
                                    <p>No worker logs yet</p>
                                    <p className="text-xs text-zinc-600">Logs appear when worker is running</p>
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div
                                        key={log.id}
                                        className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-all"
                                    >
                                        <div className="flex items-start gap-2">
                                            {getStatusIcon(log.level)}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] px-1.5 py-0 h-4 ${getSourceColor(log.source)}`}
                                                    >
                                                        {log.source}
                                                    </Badge>
                                                    <span className="text-[10px] text-zinc-500 font-mono">
                                                        {new Date(log.timestamp).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                                <p className={`text-xs ${getStatusColor(log.level)} break-words`}>
                                                    {log.message}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
