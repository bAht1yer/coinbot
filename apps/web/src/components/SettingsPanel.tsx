'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTradingStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SUPPORTED_PRODUCTS } from '@/lib/types';
import { motion } from 'framer-motion';

import { Settings, Shield, Cpu } from 'lucide-react';

export function SettingsPanel() {
    const { settings, updateSettings } = useTradingStore();
    const [, setIsSaving] = useState(false);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedRef = useRef<string>('');

    // Debounce auto-save to database
    const saveToDatabase = useCallback(async () => {
        // Create a snapshot to compare and avoid duplicate saves
        const snapshot = JSON.stringify(settings);
        if (snapshot === lastSavedRef.current) return;

        setIsSaving(true);
        try {
            const response = await fetch('/api/bot/config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pair: settings.selectedProduct,
                    // Strategy
                    priceThresholdEnabled: settings.priceThresholdEnabled,
                    buyBelowPrice: settings.buyBelowPrice,
                    sellAbovePrice: settings.sellAbovePrice,
                    buyAmountUsd: settings.buyAmountUsd,
                    maxPositionUsd: settings.maxPositionUsd,
                    sellPercentage: settings.sellPercentage,
                    // Grid
                    gridBuyingEnabled: settings.gridBuyingEnabled,
                    gridDropPercent: settings.gridDropPercent,
                    gridMaxLayers: settings.gridMaxLayers,
                    // RSI
                    rsiFilterEnabled: settings.rsiFilterEnabled,
                    rsiOversold: settings.rsiOversold,
                    // Trailing Stop
                    trailingStopEnabled: settings.trailingStopEnabled,
                    trailingStopTrigger: settings.trailingStopTrigger,
                    trailingStopDistance: settings.trailingStopDistance,
                    // Risk
                    stopLossPct: settings.stopLossPct,
                    takeProfitPct: settings.takeProfitPct,
                    // Other
                    cooldownMinutes: settings.cooldownMinutes,
                    isPaperTrading: settings.paperTradingMode,
                }),
            });

            if (response.ok) {
                lastSavedRef.current = snapshot;
                console.log('[SettingsPanel] Settings saved to database');
            }
        } catch (error) {
            console.error('[SettingsPanel] Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    }, [settings]);

    // Trigger debounced save when settings change
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            saveToDatabase();
        }, 1500); // 1.5 second debounce

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [settings, saveToDatabase]);

    return (
        <GlassCard className="border-white/5">
            <div className="pb-3 sm:pb-4 border-b border-white/5 mb-3 sm:mb-4 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                    Protocol Settings
                </h2>
            </div>

            <Tabs defaultValue="strategy" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-zinc-900/50 border border-white/5 p-1 rounded-lg">
                    <TabsTrigger
                        value="strategy"
                        className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 border border-transparent transition-all duration-300 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                    >
                        <Cpu className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Strategy</span>
                        <span className="sm:hidden">Strat</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="risk"
                        className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 border border-transparent transition-all duration-300 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                    >
                        <Shield className="w-3 h-3 sm:w-4 sm:h-4" /> Risk
                    </TabsTrigger>
                    <TabsTrigger
                        value="advanced"
                        className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 border border-transparent transition-all duration-300 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                    >
                        <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Advanced</span>
                        <span className="sm:hidden">Adv</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="strategy" className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
                    {/* Price Threshold */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-neon-cyan/30 transition-colors"
                    >
                        <Label className="text-zinc-200 font-medium tracking-wide">Price Threshold</Label>
                        <Switch
                            checked={settings.priceThresholdEnabled}
                            onCheckedChange={(checked) => updateSettings({ priceThresholdEnabled: checked })}
                            className="data-[state=checked]:bg-neon-cyan"
                        />
                    </motion.div>

                    {settings.priceThresholdEnabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-neon-cyan/70">Buy Below ($)</Label>
                                <Input
                                    type="number"
                                    value={settings.buyBelowPrice}
                                    onChange={(e) => updateSettings({ buyBelowPrice: parseFloat(e.target.value) })}
                                    className="bg-black/50 border-white/10 text-neon-cyan focus:border-neon-cyan/50 font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-neon-purple/70">Sell Above ($)</Label>
                                <Input
                                    type="number"
                                    value={settings.sellAbovePrice}
                                    onChange={(e) => updateSettings({ sellAbovePrice: parseFloat(e.target.value) })}
                                    className="bg-black/50 border-white/10 text-neon-purple focus:border-neon-purple/50 font-mono"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-zinc-400">Buy Amount (USD)</Label>
                            <Input
                                type="number"
                                value={settings.buyAmountUsd}
                                onChange={(e) => updateSettings({ buyAmountUsd: parseFloat(e.target.value) })}
                                className="bg-black/50 border-white/10 text-white focus:border-neon-cyan/50 font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-zinc-400">Max Position (USD)</Label>
                            <Input
                                type="number"
                                value={settings.maxPositionUsd}
                                onChange={(e) => updateSettings({ maxPositionUsd: parseFloat(e.target.value) })}
                                className="bg-black/50 border-white/10 text-white focus:border-neon-cyan/50 font-mono"
                            />
                        </div>
                    </div>

                    {/* RSI Filter */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-neon-cyan/30 transition-colors"
                    >
                        <div>
                            <Label className="text-zinc-200 font-medium tracking-wide">RSI Filter</Label>
                            <p className="text-[10px] uppercase text-zinc-500 tracking-wider">Momentum Indicator</p>
                        </div>
                        <Switch
                            checked={settings.rsiFilterEnabled}
                            onCheckedChange={(checked) => updateSettings({ rsiFilterEnabled: checked })}
                            className="data-[state=checked]:bg-neon-cyan"
                        />
                    </motion.div>

                    {settings.rsiFilterEnabled && (
                        <div className="space-y-2 px-1 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-xs text-zinc-400">Oversold Threshold: <span className="text-neon-cyan font-mono">{settings.rsiOversold}</span></Label>
                            <Slider
                                value={[settings.rsiOversold]}
                                onValueChange={([value]) => updateSettings({ rsiOversold: value })}
                                min={10}
                                max={50}
                                step={1}
                                className="w-full py-4"
                            />
                        </div>
                    )}

                    {/* Grid Buying */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-neon-cyan/30 transition-colors"
                    >
                        <div>
                            <Label className="text-zinc-200 font-medium tracking-wide">Grid Protocol</Label>
                            <p className="text-[10px] uppercase text-zinc-500 tracking-wider">DCA Accumulation</p>
                        </div>
                        <Switch
                            checked={settings.gridBuyingEnabled}
                            onCheckedChange={(checked) => updateSettings({ gridBuyingEnabled: checked })}
                            className="data-[state=checked]:bg-neon-cyan"
                        />
                    </motion.div>

                    {settings.gridBuyingEnabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 px-1 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <Label className="text-xs text-zinc-400">Drop % per Layer</Label>
                                <Input
                                    type="number"
                                    value={settings.gridDropPercent}
                                    onChange={(e) => updateSettings({ gridDropPercent: parseFloat(e.target.value) })}
                                    className="bg-black/50 border-white/10 text-white font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-zinc-400">Max Layers</Label>
                                <Input
                                    type="number"
                                    value={settings.gridMaxLayers}
                                    onChange={(e) => updateSettings({ gridMaxLayers: parseInt(e.target.value) })}
                                    className="bg-black/50 border-white/10 text-white font-mono"
                                    min={1}
                                    max={10}
                                />
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="risk" className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
                    {/* Trailing Stop */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-neon-purple/30 transition-colors"
                    >
                        <div>
                            <Label className="text-zinc-200 font-medium tracking-wide">Trailing Stop</Label>
                            <p className="text-[10px] uppercase text-zinc-500 tracking-wider">Profit Locking</p>
                        </div>
                        <Switch
                            checked={settings.trailingStopEnabled}
                            onCheckedChange={(checked) => updateSettings({ trailingStopEnabled: checked })}
                            className="data-[state=checked]:bg-neon-purple"
                        />
                    </motion.div>

                    {settings.trailingStopEnabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 px-1 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <Label className="text-xs text-zinc-400">Trigger %</Label>
                                <Input
                                    type="number"
                                    value={settings.trailingStopTrigger}
                                    onChange={(e) => updateSettings({ trailingStopTrigger: parseFloat(e.target.value) })}
                                    className="bg-black/50 border-white/10 text-neon-purple font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-zinc-400">Trail Distance %</Label>
                                <Input
                                    type="number"
                                    value={settings.trailingStopDistance}
                                    onChange={(e) => updateSettings({ trailingStopDistance: parseFloat(e.target.value) })}
                                    className="bg-black/50 border-white/10 text-neon-purple font-mono"
                                />
                            </div>
                        </div>
                    )}

                    {/* Stop Loss Percentage */}
                    <div className="space-y-2 p-4 bg-rose-500/5 rounded-lg border border-rose-500/20">
                        <Label className="text-xs uppercase tracking-wider text-rose-400">Stop Loss: <span className="font-mono text-base">{settings.stopLossPct}%</span></Label>
                        <Slider
                            value={[settings.stopLossPct]}
                            onValueChange={([value]) => updateSettings({ stopLossPct: value })}
                            min={1}
                            max={10}
                            step={0.5}
                            className="w-full py-2"
                        />
                        <p className="text-[10px] text-zinc-500">Sells if price drops by this % from entry</p>
                    </div>

                    {/* Take Profit Percentage */}
                    <div className="space-y-2 p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                        <Label className="text-xs uppercase tracking-wider text-emerald-400">Take Profit: <span className="font-mono text-base">{settings.takeProfitPct}%</span></Label>
                        <Slider
                            value={[settings.takeProfitPct]}
                            onValueChange={([value]) => updateSettings({ takeProfitPct: value })}
                            min={1}
                            max={20}
                            step={0.5}
                            className="w-full py-2"
                        />
                        <p className="text-[10px] text-zinc-500">Sells if price rises by this % from entry</p>
                    </div>

                    {/* Sell Percentage */}
                    <div className="space-y-2 p-4 bg-white/5 rounded-lg border border-white/10">
                        <Label className="text-xs uppercase tracking-wider text-zinc-400">Sell Percentage: <span className="text-neon-purple font-mono text-base">{settings.sellPercentage}%</span></Label>
                        <Slider
                            value={[settings.sellPercentage]}
                            onValueChange={([value]) => updateSettings({ sellPercentage: value })}
                            min={10}
                            max={100}
                            step={5}
                            className="w-full py-2"
                        />
                    </div>

                    {/* Cooldown */}
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-zinc-400">Cooldown (Minutes)</Label>
                        <Input
                            type="number"
                            value={settings.cooldownMinutes}
                            onChange={(e) => updateSettings({ cooldownMinutes: parseInt(e.target.value) })}
                            className="bg-black/50 border-white/10 text-white font-mono"
                            min={0}
                            max={60}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
                    {/* Paper Trading */}
                    <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${settings.paperTradingMode ? 'bg-blue-500/5 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-red-500/5 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className={`text-sm font-bold tracking-wide ${settings.paperTradingMode ? 'text-blue-400' : 'text-red-400'}`}>
                                    {settings.paperTradingMode ? 'SIMULATION MODE' : 'LIVE TRADING'}
                                </Label>
                                <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
                                    {settings.paperTradingMode ? 'Capital Safe • Market Data Real' : 'Capital at Risk • Live Execution'}
                                </p>
                            </div>
                            <Switch
                                checked={settings.paperTradingMode}
                                onCheckedChange={(checked) => {
                                    if (!checked) {
                                        const confirmed = window.confirm(
                                            '⚠️ PROTOCOL WARNING: Disabling simulation will execute REAL trades. Confirm?'
                                        );
                                        if (!confirmed) return;
                                    }
                                    updateSettings({ paperTradingMode: checked });
                                }}
                                className={settings.paperTradingMode ? "data-[state=checked]:bg-blue-500" : "data-[state=unchecked]:bg-red-500"}
                            />
                        </div>
                    </div>

                    {/* Trading Pair Info */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                        <Label className="text-zinc-200 font-medium tracking-wide">Market Access</Label>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {SUPPORTED_PRODUCTS.map((product) => (
                                <button
                                    key={product}
                                    onClick={() => updateSettings({ selectedProduct: product })}
                                    className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${settings.selectedProduct === product
                                        ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,243,255,0.2)]'
                                        : 'bg-black/40 text-zinc-500 border border-white/5 hover:border-white/20'
                                        }`}
                                >
                                    {product}
                                </button>
                            ))}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </GlassCard>
    );
}
