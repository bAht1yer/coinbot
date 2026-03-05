'use client';

import { useEffect, useState, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Terminal, CheckCircle, XCircle, AlertTriangle, Zap, RefreshCw, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SystemLog {
    id: string;
    timestamp: string;
    level: string;
    source: string;
    message: string;
}

export function WorkerLogsCard() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/logs?limit=30');
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

    useEffect(() => {
        fetchLogs();
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

    const handleExport = () => {
        if (logs.length === 0) return;

        const headers = ['Time', 'Level', 'Source', 'Message'];
        const rows = logs.map(l => [
            new Date(l.timestamp).toLocaleString(),
            l.level,
            l.source,
            `"${l.message.replace(/"/g, '""')}"` // Escape quotes
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worker_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getStatusIcon = (level: string) => {
        switch (level) {
            case 'success':
                return <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />;
            case 'error':
                return <XCircle className="w-3 h-3 text-red-400 shrink-0" />;
            case 'warn':
                return <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />;
            case 'info':
            default:
                return <Zap className="w-3 h-3 text-blue-400 shrink-0" />;
        }
    };

    const getStatusColor = (level: string) => {
        switch (level) {
            case 'success': return 'text-emerald-400';
            case 'error': return 'text-red-400';
            case 'warn': return 'text-amber-400';
            default: return 'text-zinc-300';
        }
    };

    return (
        <GlassCard className="h-full flex flex-col p-0 border-white/5 bg-zinc-900/40 overflow-hidden">
            {/* Header */}
            <div className="p-2 sm:p-3 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-blue-400" />
                    <span className="text-xs sm:text-sm font-semibold text-white">Worker Logs</span>
                    {isLoading && (
                        <span className="text-[10px] text-zinc-500 animate-pulse">syncing...</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <Button
                        onClick={handleExport}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-zinc-500 hover:text-white"
                        disabled={logs.length === 0}
                        title="Export CSV"
                    >
                        <Download className="w-3 h-3" />
                    </Button>
                    <Button
                        onClick={fetchLogs}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-zinc-400 hover:text-white"
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                        onClick={clearLogs}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-zinc-500 hover:text-rose-400"
                        title="Clear Logs"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-500">
                        {logs.length}
                    </Badge>
                </div>
            </div>

            {/* Logs List */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs gap-1 py-6">
                        <Terminal className="w-6 h-6 opacity-30" />
                        <p>No worker logs yet</p>
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className="flex items-start gap-2 p-1.5 rounded bg-zinc-800/30 border border-zinc-800/50 hover:border-zinc-700/50 transition-all"
                        >
                            {getStatusIcon(log.level)}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-[9px] text-zinc-600 font-mono">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <p className={`text-[11px] ${getStatusColor(log.level)} break-words leading-tight`}>
                                    {log.message}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </GlassCard>
    );
}
