'use client';

import { useEffect, useRef, useState } from 'react';
import {
    createChart,
    IChartApi,
    CandlestickSeries,
    LineSeries,
    CrosshairMode
} from 'lightweight-charts';
import { useTradingStore } from '@/lib/store';

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface PriceChartProps {
    product: string;
}

type ChartType = 'candles' | 'line';
type Timeframe = 'ONE_MINUTE' | 'FIVE_MINUTE' | 'FIFTEEN_MINUTE' | 'ONE_HOUR' | 'ONE_DAY';

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
    { value: 'ONE_MINUTE', label: '1m' },
    { value: 'FIVE_MINUTE', label: '5m' },
    { value: 'FIFTEEN_MINUTE', label: '15m' },
    { value: 'ONE_HOUR', label: '1H' },
    { value: 'ONE_DAY', label: '1D' },
];

export function PriceChart({ product }: PriceChartProps) {
    const { setMarketData } = useTradingStore();
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartType, setChartType] = useState<ChartType>('candles');
    const [timeframe, setTimeframe] = useState<Timeframe>('FIFTEEN_MINUTE');
    const [showCrosshair, setShowCrosshair] = useState(true);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Create chart with improved styling
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: 'transparent' }, // Transparent for glass effect
                textColor: '#a1a1aa',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            crosshair: {
                mode: showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
                vertLine: {
                    width: 1,
                    color: '#ffffff',
                    style: 2,
                    labelBackgroundColor: '#3f3f46',
                },
                horzLine: {
                    width: 1,
                    color: '#ffffff',
                    style: 2,
                    labelBackgroundColor: '#3f3f46',
                },
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: { top: 0.1, bottom: 0.2 },
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: true,
                secondsVisible: false,
            },
            handleScroll: { vertTouchDrag: false },
        });

        chartRef.current = chart;

        let series: any;

        if (chartType === 'candles') {
            series = chart.addSeries(CandlestickSeries, {
                upColor: '#22c55e', // Standard Green
                downColor: '#ef4444', // Standard Red
                borderDownColor: '#ef4444',
                borderUpColor: '#22c55e',
                wickDownColor: '#ef4444',
                wickUpColor: '#22c55e',
            });
        } else {
            series = chart.addSeries(LineSeries, {
                color: '#22c55e', // Green Line
                lineWidth: 2,
            });
        }

        // Fetch candle data
        const fetchCandles = async () => {
            try {
                // Check if component is still mounted/chart exists
                if (!chartRef.current) return;

                setIsLoading(true);
                setError(null);

                const response = await fetch(
                    `/api/market/${product}/candles?granularity=${timeframe}&limit=150`
                );

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to fetch candles');
                }

                const data = await response.json();

                if (data.candles && data.candles.length > 0 && chartRef.current) {
                    // Localize time for intraday charts by shifting timestamps
                    // We only shift intraday because Daily candles are standard UTC midnight
                    const timeShift = timeframe === 'ONE_DAY' ? 0 : new Date().getTimezoneOffset() * 60;
                    const adjustedCandles = data.candles.map((c: any) => ({
                        ...c,
                        time: c.time - timeShift,
                    }));

                    if (chartType === 'candles') {
                        series.setData(adjustedCandles);
                    } else {
                        // For line chart, use close prices
                        series.setData(adjustedCandles.map((c: any) => ({
                            time: c.time,
                            value: c.close,
                        })));
                    }

                    // Calculate RSI
                    const rsi = calculateRsi(data.candles);

                    // Get last price and update store
                    const lastCandle = data.candles[data.candles.length - 1];
                    setMarketData(lastCandle.close, rsi);
                }

                if (chartRef.current) {
                    chart.timeScale().fitContent();
                }
                setIsLoading(false);
            } catch (err) {
                if (chartRef.current) {
                    setError(err instanceof Error ? err.message : 'Failed to load chart');
                    setIsLoading(false);
                }
            }
        };

        fetchCandles();

        // Refresh based on timeframe
        const refreshMs = timeframe === 'ONE_MINUTE' ? 15000 : 60000;
        const interval = setInterval(fetchCandles, refreshMs);

        // Handle resize
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(interval);
            chart.remove();
            chartRef.current = null;
        };
    }, [product, setMarketData, chartType, timeframe, showCrosshair]);

    return (
        <div className="relative h-full w-full min-h-[280px] sm:min-h-[400px] rounded-xl overflow-hidden glass border-neon-cyan/20">
            {/* Subtle animated border using simple pseudo-element or just CSS class */}
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-neon-cyan/50 to-transparent opacity-50" />

            {/* Chart Controls */}
            <div className="absolute top-2 left-2 z-20 flex gap-1 sm:gap-2 flex-nowrap bg-black/50 p-1 rounded-lg backdrop-blur-sm border border-white/10 overflow-x-auto mobile-scroll-x max-w-[calc(100%-1rem)]">
                {/* Chart Type Toggle */}
                <div className="flex rounded-md overflow-hidden">
                    <button
                        onClick={() => setChartType('candles')}
                        className={`px-2 sm:px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${chartType === 'candles'
                            ? 'bg-neon-cyan/20 text-neon-cyan'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        Candles
                    </button>
                    <button
                        onClick={() => setChartType('line')}
                        className={`px-2 sm:px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${chartType === 'line'
                            ? 'bg-neon-purple/20 text-neon-purple'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        Line
                    </button>
                </div>

                <div className="w-[1px] bg-white/10 mx-0.5 sm:mx-1 flex-shrink-0" />

                {/* Timeframe Selector */}
                <div className="flex rounded-md overflow-hidden flex-shrink-0">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf.value}
                            onClick={() => setTimeframe(tf.value)}
                            className={`px-1.5 sm:px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${timeframe === tf.value
                                ? 'text-white font-bold'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>

                <div className="w-[1px] bg-white/10 mx-0.5 sm:mx-1 flex-shrink-0" />

                {/* Crosshair Toggle */}
                <button
                    onClick={() => setShowCrosshair(!showCrosshair)}
                    className={`px-2 sm:px-3 py-1 text-xs font-medium rounded transition-colors ${showCrosshair
                        ? 'text-neon-cyan'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    ✛
                </button>
            </div>

            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-zinc-300">
                        <div className="animate-spin h-8 w-8 border-2 border-neon-cyan border-t-transparent rounded-full shadow-[0_0_15px_#00f3ff]"></div>
                        <span className="text-xs uppercase tracking-widest text-neon-cyan animate-pulse">Initializing Data Stream...</span>
                    </div>
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                    <div className="text-red-400 text-center p-6 border border-red-500/20 rounded-xl bg-red-950/20">
                        <p>⚠️ {error}</p>
                        <p className="text-sm text-zinc-400 mt-2">Configure API credentials to view chart</p>
                    </div>
                </div>
            )}
            <div ref={chartContainerRef} className="h-full w-full" />
        </div>
    );
}

// Simple RSI calculation
function calculateRsi(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 50;

    const closes = candles.map(c => c.close);
    const changes: number[] = [];

    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }

    avgGain /= period;
    avgLoss /= period;

    for (let i = period; i < changes.length; i++) {
        const change = changes[i];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}
