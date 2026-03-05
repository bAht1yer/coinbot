import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TradingSettings, TradeLogEntry, DEFAULT_SETTINGS, PositionState } from './types';

interface TradingState {
    // Settings
    settings: TradingSettings;
    updateSettings: (settings: Partial<TradingSettings>) => void;

    // Trading status
    isRunning: boolean;
    isConnected: boolean;
    setIsRunning: (running: boolean) => void;
    setIsConnected: (connected: boolean) => void;

    // Market data
    currentPrice: number;
    rsi: number;
    setMarketData: (price: number, rsi: number) => void;

    // Balances
    balances: Record<string, number>;
    setBalances: (balances: Record<string, number>) => void;

    // Trade log
    trades: TradeLogEntry[];
    addTrade: (trade: TradeLogEntry) => void;
    setTrades: (trades: TradeLogEntry[]) => void;
    clearTrades: () => void;

    // Logs
    logs: string[];
    addLog: (message: string) => void;
    clearLogs: () => void;
    // Position
    position: PositionState;
    setPosition: (position: PositionState) => void;
    updatePosition: (updates: Partial<PositionState>) => void;
}

const DEFAULT_POSITION: PositionState = {
    product: 'BTC-USD',
    quantity: 0,
    averageEntryPrice: 0,
    highestPrice: 0,
    lastTradeTime: null,
    gridLayer: 0,
    gridBasePrice: 0,
};

export const useTradingStore = create<TradingState>()(
    persist(
        (set) => ({
            // Settings
            settings: DEFAULT_SETTINGS,
            updateSettings: (newSettings) =>
                set((state) => ({
                    settings: { ...state.settings, ...newSettings },
                })),

            // Trading status
            isRunning: false,
            isConnected: false,
            setIsRunning: (running) => set({ isRunning: running }),
            setIsConnected: (connected) => set({ isConnected: connected }),

            // Market data
            currentPrice: 0,
            rsi: 50,
            setMarketData: (price, rsi) => set({ currentPrice: price, rsi }),

            // Position
            position: DEFAULT_POSITION,
            setPosition: (position) => set({ position }),
            updatePosition: (updates) =>
                set((state) => ({
                    position: { ...state.position, ...updates },
                })),

            // Balances
            balances: {},
            setBalances: (balances) => set({ balances }),

            // Trade log
            trades: [],
            addTrade: (trade) =>
                set((state) => ({
                    trades: [trade, ...state.trades].slice(0, 100), // Keep last 100 trades
                })),
            setTrades: (trades) => set({ trades }),
            clearTrades: () => set({ trades: [] }),

            // Logs
            logs: [],
            addLog: (message) =>
                set((state) => ({
                    logs: [
                        `[${new Date().toLocaleTimeString()}] ${message}`,
                        ...state.logs,
                    ].slice(0, 100), // Increased log limit
                })),
            clearLogs: () => set({ logs: [] }),
        }),
        {
            name: 'coinbot-storage',
            partialize: (state) => ({
                settings: state.settings,
                trades: state.trades,
                position: state.position, // Persist position
            }),
        }
    )
);
