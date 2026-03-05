'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTradingStore } from '@/lib/store';
import { PriceChart } from '@/components/PriceChart';
import { BalanceCard } from '@/components/BalanceCard';
import { TradeLog } from '@/components/TradeLog';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SUPPORTED_PRODUCTS } from '@/lib/types';
import { PixelBot } from '@/components/ui/PixelBot';
import { WorkerLogsCard } from '@/components/WorkerLogsCard';
import { AuthButton } from '@/components/AuthButton';
import { Activity, Play, Square, Plug, BarChart2, ChevronDown, ShieldCheck, Lock, FileJson, AlertCircle, Eye, EyeOff, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { data: session, status } = useSession(); // Get auth status needed for UI logic

  const {
    settings,
    updateSettings,
    isRunning,
    setIsRunning,
    isConnected,
    setIsConnected,
    currentPrice,
    rsi,
    addLog,
    logs,
  } = useTradingStore();

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiPrivateKey, setApiPrivateKey] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const tradingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // NOTE: All trading logic is now handled by the coinbot-worker server
  // This dashboard is display-only - it fetches data from Railway database
  // No in-app trading simulation to avoid Vercel serverless limits

  // Cleanup any trading refs (no longer used)
  useEffect(() => {
    return () => {
      if (tradingIntervalRef.current) {
        clearInterval(tradingIntervalRef.current);
      }
    };
  }, []);

  // Auto-load credentials AND sync running state when authenticated user loads the page
  useEffect(() => {
    const syncFromDatabase = async () => {
      if (status !== 'authenticated') return;

      try {
        // Check API credentials
        const credResponse = await fetch('/api/auth/configure');
        const credData = await credResponse.json();

        if (credResponse.ok && credData.configured) {
          setIsConnected(true);
          addLog('API credentials loaded from database');
        }

        // Sync bot running state from database
        const configResponse = await fetch('/api/bot/config');
        const configData = await configResponse.json();

        if (configResponse.ok && configData.config) {
          // If there's an active config in DB, sync the running state
          const isActive = configData.config.isActive === true;
          setIsRunning(isActive);
          if (isActive) {
            addLog(`Bot is running for ${configData.config.pair}`);
          }
        } else {
          // No config found, ensure bot is shown as stopped
          setIsRunning(false);
        }
      } catch (error) {
        console.error('Failed to sync from database:', error);
      }
    };

    syncFromDatabase();
  }, [status, setIsConnected, setIsRunning, addLog]);

  // Poll for new trades
  useEffect(() => {
    // Only poll if authenticated
    if (status !== 'authenticated') return;

    const { setTrades } = useTradingStore.getState();

    const fetchTrades = async () => {
      try {
        const response = await fetch('/api/trades?limit=50');
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.trades)) {
            setTrades(data.trades);
          }
        }
      } catch (error) {
        console.error('Failed to fetch trades:', error);
      }
    };

    // Initial fetch
    fetchTrades();

    // Poll every 5 seconds
    const interval = setInterval(fetchTrades, 5000);

    return () => clearInterval(interval);
  }, [status]);

  const handleConfigure = async () => {
    if (!apiKeyId || !apiPrivateKey) {
      setConfigError('Please enter both Key ID and Private Key');
      return;
    }

    setConfigError(null);

    try {
      const response = await fetch('/api/auth/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: apiKeyId, privateKey: apiPrivateKey }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsConnected(true);
        setIsConfiguring(false);
        addLog('Connected to Coinbase API');
      } else {
        setConfigError(data.error || data.details || 'Failed to connect');
      }
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Network error');
    }
  };

  const handleImportJson = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      try {
        const json = JSON.parse(text);
        if (json.id && json.privateKey) {
          setApiKeyId(json.id);
          setApiPrivateKey(json.privateKey);
          addLog('JSON file loaded successfully');
        } else if (json.name && json.privateKey) {
          // Alternative format
          setApiKeyId(json.name);
          setApiPrivateKey(json.privateKey);
          addLog('JSON file loaded successfully');
        } else {
          setConfigError('Invalid JSON format');
        }
      } catch {
        setConfigError('Failed to parse JSON file');
      }
    };
    input.click();
  };

  const handleStartStop = async () => {
    if (isRunning) {
      // Stop the bot - update database
      try {
        await fetch('/api/bot/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pair: settings.selectedProduct,
            isActive: false,
            isPaperTrading: settings.paperTradingMode
          }),
        });
        setIsRunning(false);
        addLog('Trading stopped');
      } catch (error) {
        addLog('Failed to stop bot: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    } else {
      if (!isConnected) {
        addLog('Cannot start: Not connected to Coinbase API');
        return;
      }
      // Start the bot - update database
      try {
        const response = await fetch('/api/bot/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pair: settings.selectedProduct,
            isActive: true,
            isPaperTrading: settings.paperTradingMode
          }),
        });
        const data = await response.json();
        if (data.success) {
          setIsRunning(true);
          updateSettings({ tradingEnabled: true });
          addLog(`Trading started (${settings.paperTradingMode ? 'PAPER' : 'LIVE'} mode)`);
          addLog(`Watching ${settings.selectedProduct} | Buy < $${settings.buyBelowPrice} | Sell > $${settings.sellAbovePrice}`);
        } else {
          addLog('Failed to start bot: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        addLog('Failed to start bot: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 100 } as const
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-zinc-950 text-foreground p-3 sm:p-4 md:p-6 font-sans antialiased selection:bg-zinc-800 selection:text-white"
    >
      {/* Header */}
      <motion.header variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3 tracking-tight">
            <div className="flex items-center justify-center pt-1">
              <PixelBot
                className="w-6 h-6 sm:w-8 sm:h-8"
                isRunning={isRunning}
                mode={settings.paperTradingMode ? 'paper' : 'live'}
              />
            </div>
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">CoinBot</span>
            <Badge
              variant="outline"
              className={`ml-2 font-mono text-[10px] sm:text-xs border transition-colors ${settings.paperTradingMode
                ? 'text-amber-400 bg-amber-950/30 border-amber-900/50'
                : 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50'
                }`}
            >
              {settings.paperTradingMode ? 'PAPER' : 'LIVE'}
            </Badge>
          </h1>
          <p className="text-zinc-500 text-sm ml-11 font-medium font-mono tracking-tight">Algorithmic Trading System</p>
        </div>

        {/* Control Buttons - Flow with >>> indicators */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end flex-wrap">
          {/* User */}
          <div className="flex items-center">
            <AuthButton />
          </div>

          <span className="text-zinc-600 text-xs hidden sm:block">›››</span>
          <span className="text-zinc-600 text-[10px] sm:hidden">›</span>

          {/* API */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse-glow' : 'bg-red-500'}`} />
              <span className="text-xs font-medium text-zinc-400">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            {status === 'authenticated' && !isConnected && (
              <Button
                onClick={() => setIsConfiguring(true)}
                variant="outline"
                size="sm"
                className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 gap-1.5 h-9"
              >
                <Plug className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Configure</span>
              </Button>
            )}
            {status === 'authenticated' && isConnected && (
              <Button
                onClick={() => setIsConfiguring(true)}
                variant="ghost"
                size="sm"
                className="text-zinc-500 hover:text-zinc-300 gap-1.5 h-9"
              >
                <Plug className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-xs">Modify</span>
              </Button>
            )}
          </div>

          <span className="text-zinc-600 text-xs hidden sm:block">›››</span>
          <span className="text-zinc-600 text-[10px] sm:hidden">›</span>

          {/* Bot */}
          <Button
            onClick={handleStartStop}
            size="sm"
            className={`font-medium gap-2 transition-all duration-300 h-9 ${isRunning
              ? 'bg-rose-950/50 hover:bg-rose-900/80 text-rose-400 border border-rose-900/50 shadow-[0_0_15px_rgba(244,63,94,0.4),0_0_30px_rgba(244,63,94,0.2)] animate-pulse'
              : 'bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-900/50 shadow-lg shadow-emerald-900/20 hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]'}`}
            disabled={!isConnected}
          >
            {isRunning ? (
              <>
                <Square className="w-3 h-3 fill-current animate-pulse" />
                <span className="animate-pulse">Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span className="hidden sm:inline">Run</span>
                <span className="sm:hidden">Go</span>
              </>
            )}
          </Button>
        </div>
      </motion.header>

      {/* API Configuration Modal */}
      {/* API Configuration Modal */}
      {isConfiguring && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg"
          >
            <Card className="bg-zinc-950 border-white/10 shadow-2xl overflow-hidden relative">

              <CardHeader className="pb-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg">Connect Securely</CardTitle>
                    <p className="text-zinc-400 text-xs mt-0.5 flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> End-to-end AES-256 Encryption
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">

                {/* Trust Banner */}
                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-3 flex gap-3 text-left">
                  <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-indigo-200 text-xs font-medium">Your credentials are safe</p>
                    <p className="text-indigo-200/70 text-[10px] leading-relaxed">
                      Typically located in <code className="bg-black/30 px-1 rounded">cdp_api_key.json</code>.
                      Keys are encrypted immediately upon receipt and never exposed.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <Button
                    onClick={handleImportJson}
                    className="w-full h-10 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/30 hover:bg-zinc-800/80 text-zinc-300 transition-all group relative overflow-hidden text-sm"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <span className="flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-emerald-400" />
                      Import JSON File
                    </span>
                  </Button>

                  <div className="relative flex items-center py-1">
                    <div className="grow border-t border-zinc-800"></div>
                    <span className="shrink-0 mx-4 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Or Enter Manually</span>
                    <div className="grow border-t border-zinc-800"></div>
                  </div>

                  {/* Key ID Input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400 ml-1">Key Name / ID</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={apiKeyId}
                        onChange={(e) => setApiKeyId(e.target.value)}
                        placeholder="organizations/org_id/apiKeys/key_id"
                        className="w-full px-3 py-2 bg-zinc-900/50 border border-white/5 focus:border-emerald-500/50 rounded-lg text-white font-mono text-xs placeholder:text-zinc-600 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Private Key Input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400 ml-1">Private Key</label>
                    <div className="relative group">
                      <input
                        type={showPrivateKey ? "text" : "password"}
                        value={apiPrivateKey}
                        onChange={(e) => setApiPrivateKey(e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----..."
                        className="w-full pl-3 pr-10 py-2 bg-zinc-900/50 border border-white/5 focus:border-emerald-500/50 rounded-lg text-white font-mono text-xs placeholder:text-zinc-600 outline-none transition-colors"
                      />
                      <button
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors rounded-md hover:bg-white/5"
                        title={showPrivateKey ? "Hide Key" : "Show Key"}
                      >
                        {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {configError && (
                  <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/20 border border-rose-900/50 p-2 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {configError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button
                    onClick={() => setIsConfiguring(false)}
                    variant="ghost"
                    className="flex-1 h-9 text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5 text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfigure}
                    className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 text-sm"
                  >
                    Connect API
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left Column: Chart & Settings */}
        <motion.div variants={itemVariants} className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">
          {/* Chart Section */}
          <GlassCard className="min-h-[350px] sm:min-h-[500px]">
            <div className="pb-2 border-b border-white/5 mb-2">
              <div className="flex justify-between items-center">
                {/* Currency Dropdown Selector */}
                <div className="relative">
                  <button
                    onClick={() => setIsCurrencyMenuOpen(!isCurrencyMenuOpen)}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-zinc-800 text-white border border-zinc-600 hover:bg-zinc-700 transition-all"
                  >
                    <span className="font-mono">{settings.selectedProduct}</span>
                    <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${isCurrencyMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {isCurrencyMenuOpen && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsCurrencyMenuOpen(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
                        {SUPPORTED_PRODUCTS.map((product) => (
                          <button
                            key={product}
                            onClick={async () => {
                              updateSettings({ selectedProduct: product });
                              setIsCurrencyMenuOpen(false);
                              // Sync to worker database
                              try {
                                await fetch('/api/bot/config', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    pair: product,
                                    isPaperTrading: settings.paperTradingMode
                                  }),
                                });
                                addLog(`Switched to ${product}`);
                              } catch (e) {
                                console.error('Failed to sync currency:', e);
                              }
                            }}
                            className={`w-full px-3 py-2 text-left text-xs sm:text-sm font-mono transition-colors flex items-center justify-between ${settings.selectedProduct === product
                              ? 'bg-zinc-700 text-white'
                              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                          >
                            {product}
                            {settings.selectedProduct === product && (
                              <span className="text-emerald-400">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg sm:text-2xl font-bold font-mono text-white tracking-wider">
                    ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-sm ${rsi < 30 ? 'text-green-400' : rsi > 70 ? 'text-red-400' : 'text-zinc-400'}`}>
                    RSI: <span className="font-mono">{rsi.toFixed(1)}</span> {rsi < 30 ? '📉 Oversold' : rsi > 70 ? '📈 Overbought' : ''}
                  </div>
                </div>
              </div>
            </div>
            <div className="h-[250px] sm:h-[450px] relative">
              {isConnected ? (
                <PriceChart
                  product={settings.selectedProduct}
                />
              ) : (
                <div className="flex items-center justify-center h-full flex-col gap-4">
                  {/* Clean Pulse Animation */}
                  <div className="relative flex items-center justify-center w-16 h-16">
                    <div className="absolute w-full h-full bg-zinc-800 rounded-full animate-ping opacity-20"></div>
                    <div className="absolute w-12 h-12 bg-zinc-800/50 rounded-full border border-zinc-700 flex items-center justify-center">
                      <BarChart2 className="w-6 h-6 text-zinc-500" />
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-zinc-400 font-medium text-sm">Waiting for Connection</p>
                    <p className="text-zinc-600 text-xs">Configure API to view live market data</p>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Settings Section */}
          <SettingsPanel />
        </motion.div>

        {/* Right Sidebar: Balance, TradeLog & Worker Logs */}
        <motion.div variants={itemVariants} className="lg:col-span-4 flex flex-col gap-4 sm:gap-6">
          <div className="flex-none min-h-[120px]">
            <BalanceCard />
          </div>
          {/* TradeLog - larger */}
          <div className="h-[550px] sm:h-[550px]">
            <TradeLog />
          </div>
          {/* Worker Logs Card - larger */}
          <div className="h-[450px] sm:h-[500px]">
            <WorkerLogsCard />
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="mt-4 sm:mt-6 text-center text-zinc-500 text-xs sm:text-sm">
        <p>⚠️ Trading cryptocurrency involves risk. Use at your own discretion.</p>
      </footer>

    </motion.div>
  );
}
