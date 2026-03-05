'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, Power } from 'lucide-react';
import { useTradingStore } from '@/lib/store';

export function AuthButton() {
    const { data: session, status } = useSession();
    const { setIsRunning } = useTradingStore();

    // Custom sign out that stops all bots first
    const handleSignOut = async () => {
        try {
            // Stop all bots for this user before signing out
            await fetch('/api/bot/config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pair: 'ALL', // The API now ignores pair when isActive=false
                    isActive: false,
                }),
            });
            console.log('[AuthButton] Stopped all bots before logout');
        } catch (error) {
            console.error('[AuthButton] Failed to stop bots before logout:', error);
        }

        // Update local state
        setIsRunning(false);

        // Now sign out
        signOut();
    };

    if (status === 'loading') {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 rounded-full border border-zinc-800/50">
                <div className="w-5 h-5 rounded-full bg-zinc-700 animate-pulse" />
                <span className="text-xs text-zinc-500 font-mono">Connecting...</span>
            </div>
        );
    }

    if (session?.user) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-1.5 py-1.5 pr-3 bg-zinc-900/60 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] group hover:border-emerald-500/40 transition-all duration-300 animate-in fade-in slide-in-from-top-1">
                    {session.user.image ? (
                        <img
                            src={session.user.image}
                            alt=""
                            className="w-6 h-6 rounded-full border border-zinc-700"
                        />
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                            <span className="text-[10px] text-emerald-400 font-bold">
                                {session.user.name?.[0] || 'U'}
                            </span>
                        </div>
                    )}
                    <span className="text-xs font-medium text-emerald-400/90 hidden sm:inline tracking-wide font-mono">
                        {session.user.name || session.user.email?.split('@')[0]}
                    </span>
                    <div className="flex flex-col ml-1">
                        <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-bold leading-none">Status</span>
                        <span className="text-[8px] uppercase tracking-wider text-emerald-500 font-bold leading-none animate-pulse">Active</span>
                    </div>
                </div>
                <Button
                    onClick={handleSignOut}
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Sign Out (stops all bots)"
                >
                    <Power className="w-4 h-4" />
                </Button>
            </div>
        );
    }

    return (
        <Button
            onClick={() => signIn()}
            variant="outline"
            size="sm"
            className="rounded-full border-zinc-700 hover:bg-zinc-800/80 text-zinc-300 gap-2 backdrop-blur-sm transition-all hover:scale-105 hover:shadow-lg hover:shadow-zinc-900/50"
        >
            <LogIn className="w-4 h-4" />
            <span className="hidden sm:inline">Connect Account</span>
        </Button>
    );
}
