'use client';

import { useEffect, useState } from 'react';
import { useTradingStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Wallet } from 'lucide-react';

export function BalanceCard() {
    const { balances, setBalances } = useTradingStore();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBalances = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/accounts');
                if (response.ok) {
                    const data = await response.json();

                    const balanceMap: Record<string, number> = {};
                    if (data.accounts) {
                        data.accounts.forEach((acc: any) => {
                            // API returns { currency, available, total }
                            balanceMap[acc.currency] = typeof acc.total === 'number' ? acc.total : parseFloat(acc.total || '0');
                        });
                    }
                    setBalances(balanceMap);
                    setError(null);
                }
            } catch (err) {
                console.error('Failed to fetch balances', err);
                setError('Sync failed');
            } finally {
                setIsLoading(false);
            }
        };

        fetchBalances();
        const interval = setInterval(fetchBalances, 30000); // 30s update
        return () => clearInterval(interval);
    }, [setBalances]);

    const formatBalance = (total: number, currency: string) => {
        if (isNaN(total)) return '0.00';
        return currency === 'USD' || currency === 'USDC'
            ? `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : total.toLocaleString('en-US', { maximumFractionDigits: 6 });
    };

    return (
        <GlassCard className="p-0 border-white/5 bg-zinc-900/40">
            <div className="p-3 sm:p-4 py-2 sm:py-3 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
                <h3 className="text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-1.5 sm:gap-2">
                    <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500" /> Wallet
                </h3>
                {isLoading && <span className="text-[10px] text-zinc-500 uppercase tracking-widest animate-pulse">Syncing...</span>}
            </div>

            <div className="px-3 sm:px-4 py-1.5 sm:py-2">
                {error ? (
                    <div className="text-center py-2 bg-red-900/10 rounded border border-red-500/10 mb-2">
                        <p className="text-red-400 text-xs">{error}</p>
                    </div>
                ) : !balances || Object.keys(balances).length === 0 ? (
                    <div className="text-center py-8 opacity-50">
                        <p className="text-zinc-400 text-sm">No assets detected</p>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-1">Connect API to sync...</p>
                    </div>
                ) : (
                    <div className="space-y-1 pb-2">
                        {Object.entries(balances).map(([currency, amount]) => (
                            <div key={currency} className="flex justify-between items-center p-2 bg-zinc-900/30 rounded border border-white/5 hover:bg-zinc-800/50 transition-all duration-300 group">
                                <div className="flex items-center gap-2">
                                    {/* Currency Logo */}
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${currency === 'BTC' ? 'bg-orange-500/20 text-orange-400' :
                                        currency === 'ETH' ? 'bg-blue-500/20 text-blue-400' :
                                            currency === 'SOL' ? 'bg-purple-500/20 text-purple-400' :
                                                currency === 'USDC' || currency === 'USD' ? 'bg-emerald-500/20 text-emerald-400' :
                                                    'bg-zinc-500/20 text-zinc-400'
                                        }`}>
                                        {currency === 'BTC' ? '₿' :
                                            currency === 'ETH' ? 'Ξ' :
                                                currency === 'SOL' ? '◎' :
                                                    currency === 'USDC' || currency === 'USD' ? '$' :
                                                        currency.charAt(0)}
                                    </div>
                                    <Badge variant="outline" className="bg-zinc-800/50 border-white/5 text-zinc-300 text-[10px] h-5 px-1 group-hover:text-emerald-400 group-hover:border-emerald-500/20 transition-colors">
                                        {currency}
                                    </Badge>
                                </div>
                                <span className="font-mono text-xs text-zinc-300 group-hover:text-white transition-colors">
                                    {formatBalance(amount, currency)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </GlassCard>
    );
}
