import { useTradingStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { List, ArrowUpRight, ArrowDownRight, Calendar, Trash2, Download } from 'lucide-react';
import { useMemo, useState } from 'react';

export function TradeLog() {
    const { trades, clearTrades } = useTradingStore();
    const [isResetting, setIsResetting] = useState(false);

    // Reset handler
    const handleReset = async () => {
        if (!confirm('確定要重置所有交易記錄和日誌嗎？此操作不可撤銷。')) return;

        setIsResetting(true);
        try {
            const response = await fetch('/api/dev/reset', { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                clearTrades(); // Clear local state
                alert(`已重置: ${data.deletedTrades} 交易, ${data.deletedLogs} 日誌`);
            } else {
                alert('重置失敗: ' + data.error);
            }
        } catch (error) {
            alert('重置失敗');
        } finally {
            setIsResetting(false);
        }
    };

    // Export handler
    const handleExport = () => {
        if (trades.length === 0) return;

        const headers = ['Time', 'Symbol', 'Side', 'Price', 'Quantity', 'Status', 'P/L'];
        const rows = trades.map(t => [
            new Date(t.time).toLocaleString(),
            t.product,
            t.side,
            t.price,
            t.quantity,
            t.status,
            t.realizedPnl || 0
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trades_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // Group trades by session
    const sessionGroups = useMemo(() => {
        const groups: Record<string, typeof trades> = {};
        trades.forEach(trade => {
            const sessionKey = trade.sessionId || 'no-session';
            if (!groups[sessionKey]) {
                groups[sessionKey] = [];
            }
            groups[sessionKey].push(trade);
        });
        return Object.entries(groups).sort((a, b) => {
            // Sort by most recent trade in session
            const aTime = a[1][0]?.time ? new Date(a[1][0].time).getTime() : 0;
            const bTime = b[1][0]?.time ? new Date(b[1][0].time).getTime() : 0;
            return bTime - aTime;
        });
    }, [trades]);

    // Calculate Session Stats (for current/all trades)
    const sellTrades = trades.filter(t => t.side === 'SELL');
    const buyTrades = trades.filter(t => t.side === 'BUY');

    const totalPnl = sellTrades.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
    const totalBuyVol = buyTrades.reduce((acc, t) => acc + (t.price * t.quantity), 0);
    const totalSellVol = sellTrades.reduce((acc, t) => acc + (t.price * t.quantity), 0);

    const winRate = sellTrades.length > 0
        ? (sellTrades.filter(t => (t.realizedPnl || 0) > 0).length / sellTrades.length) * 100
        : 0;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'FILLED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'PAPER': return 'bg-zinc-800 text-zinc-400 border-zinc-700';
            case 'FAILED': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'ERROR': return 'bg-red-500/10 text-red-400 border-red-500/20';
            default: return 'bg-zinc-800 text-zinc-500';
        }
    };

    const getSideColor = (side: 'BUY' | 'SELL') => {
        return side === 'BUY' ? 'text-emerald-400' : 'text-rose-400';
    };

    return (
        <GlassCard className="h-full flex flex-col p-0 border-white/5 bg-zinc-900/40 overflow-hidden">
            {/* Session Stats Header */}
            <div className="flex flex-col border-b border-white/5 bg-zinc-950/30">
                {/* Row 1: Key Performance */}
                <div className="grid grid-cols-3 gap-1 sm:gap-2 p-2 sm:p-3 border-b border-white/5">
                    <div className="flex flex-col">
                        <span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wider">Total P/L</span>
                        <span className={`text-sm font-mono font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                        </span>
                    </div>
                    <div className="flex flex-col text-center border-l border-white/5">
                        <span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wider">Win Rate</span>
                        <span className="text-sm font-mono text-zinc-200">{winRate.toFixed(0)}%</span>
                    </div>
                    <div className="flex flex-col text-right border-l border-white/5">
                        <span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wider">Trades</span>
                        <span className="text-sm font-mono text-zinc-200">{trades.length}</span>
                    </div>
                </div>

                {/* Row 2: Volumes */}
                <div className="grid grid-cols-2 gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 bg-zinc-900/20 text-[10px] text-zinc-500">
                    <div className="flex justify-between items-center">
                        <span className="uppercase tracking-wider">Buy Vol</span>
                        <span className="font-mono text-emerald-400/80">${totalBuyVol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center border-l border-white/5 pl-2">
                        <span className="uppercase tracking-wider">Sell Vol</span>
                        <span className="font-mono text-rose-400/80">${totalSellVol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="p-1.5 sm:p-2 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs font-medium text-zinc-300">Trade History</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        disabled={trades.length === 0}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Export CSV"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={isResetting || trades.length === 0}
                        className="p-1 text-zinc-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Reset All Data"
                    >
                        <Trash2 className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                    </button>
                    <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-500">
                        {trades.length}
                    </Badge>
                </div>
            </div>

            {/* Trades List - Grouped by Session */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {sessionGroups.length === 0 ? (
                    <div className="text-center py-8 opacity-50">
                        <p className="text-zinc-400 text-sm">No trades executed</p>
                        <p className="text-zinc-500 text-xs mt-1">Waiting for signal...</p>
                    </div>
                ) : (
                    <div className="space-y-4 pb-4">
                        {sessionGroups.map(([sessionId, sessionTrades]) => {
                            const sessionPnl = sessionTrades
                                .filter(t => t.side === 'SELL')
                                .reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
                            const sessionStart = sessionTrades[sessionTrades.length - 1]?.time;

                            return (
                                <div key={sessionId} className="space-y-2">
                                    {/* Session Header */}
                                    <div className="flex items-center justify-between px-1 py-1 border-b border-dashed border-zinc-700/50">
                                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                            <Calendar className="w-3 h-3" />
                                            <span>
                                                {sessionId === 'no-session' ? 'Before Sessions' :
                                                    sessionStart ? new Date(sessionStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Session'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-zinc-600">{sessionTrades.length} trades</span>
                                            <span className={`text-[10px] font-mono ${sessionPnl >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                                {sessionPnl >= 0 ? '+' : ''}{sessionPnl.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Session Trades */}
                                    {sessionTrades.map((trade) => (
                                        <div key={trade.id} className="flex flex-col gap-1 p-2 sm:p-3 bg-black/20 rounded-lg border border-white/5 hover:border-zinc-700 transition-all duration-300">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className={`flex items-center gap-1 text-xs font-bold ${getSideColor(trade.side)}`}>
                                                        {trade.side === 'BUY' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                                        {trade.side}
                                                    </span>
                                                    <span className="text-zinc-500 text-xs font-mono">{trade.product}</span>
                                                </div>
                                                <Badge className={`text-[10px] ${getStatusColor(trade.status)}`}>
                                                    {trade.status}
                                                </Badge>
                                            </div>
                                            <div className="flex justify-between text-zinc-300 text-xs mt-1">
                                                <span className="font-mono text-zinc-200">${trade.price.toFixed(2)}</span>
                                                <span className="font-mono text-zinc-400">{trade.quantity.toFixed(6)}</span>
                                            </div>
                                            {trade.side === 'SELL' && trade.realizedPnl !== undefined && (
                                                <div className="flex justify-between items-center mt-1 pt-1 border-t border-white/5">
                                                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">P/L</span>
                                                    <div className={`text-xs font-mono font-bold ${trade.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {trade.realizedPnl >= 0 ? '+' : ''}{trade.realizedPnl.toFixed(2)}
                                                        <span className="opacity-70 ml-1">({trade.pnlPercent?.toFixed(2)}%)</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </GlassCard>
    );
}
