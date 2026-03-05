import React from 'react';
import { cn } from '@/lib/utils';

interface PixelBotProps {
    className?: string;
    isRunning?: boolean;
    mode?: 'paper' | 'live';
}

export const PixelBot = ({ className = "w-8 h-8", isRunning = false, mode = 'paper' }: PixelBotProps) => {
    // Determine eye color based on mode
    const eyeColorClass = mode === 'paper' ? 'bg-amber-400' : 'bg-emerald-500';
    const shadowColorClass = mode === 'paper' ? 'shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'shadow-[0_0_6px_rgba(16,185,129,0.8)]';
    const dropShadowClass = mode === 'paper' ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]';
    return (
        <div
            className={cn(className, "relative flex items-center justify-center group cursor-pointer")}
            aria-label="Pixel Bot Logo"
        >
            {/* 
        Grid based pixel art using box-shadows on a single element or small grid of divs? 
        Let's use a small grid of divs for easier coloring and clearer pixelation effect without complex shadow strings.
        8x8 grid.
      */}
            <div className={cn(
                "grid grid-cols-8 grid-rows-8 w-full h-full gap-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                isRunning && dropShadowClass
            )}>
                {/* Row 1 */}
                <div className="col-span-2 bg-transparent" />
                <div className="col-span-1 bg-zinc-500" />
                <div className="col-span-2 bg-transparent" />
                <div className="col-span-1 bg-zinc-500" />
                <div className="col-span-2 bg-transparent" />

                {/* Row 2: Antennae base */}
                <div className="col-span-2 bg-transparent" />
                <div className="col-span-1 bg-zinc-400" />
                <div className="col-span-2 bg-transparent" />
                <div className="col-span-1 bg-zinc-400" />
                <div className="col-span-2 bg-transparent" />

                {/* Row 3: Head Top */}
                <div className="col-span-1 bg-transparent" />
                <div className="col-span-6 bg-zinc-200" />
                <div className="col-span-1 bg-transparent" />

                {/* Row 4: Eyes */}
                <div className="col-span-1 bg-transparent" />
                <div className="col-span-1 bg-zinc-200" />

                {/* Eye L - Animated */}
                <div className={cn(
                    "col-span-1 overflow-hidden relative",
                    eyeColorClass,
                    isRunning && shadowColorClass
                )}>
                    <div className={cn("absolute inset-0 animate-[blink_4s_infinite]", eyeColorClass)} />
                </div>

                <div className="col-span-2 bg-zinc-200" />

                {/* Eye R - Animated */}
                <div className={cn(
                    "col-span-1 overflow-hidden relative",
                    eyeColorClass,
                    isRunning && shadowColorClass
                )}>
                    <div className={cn("absolute inset-0 animate-[blink_4s_infinite_0.1s]", eyeColorClass)} />
                </div>

                <div className="col-span-1 bg-zinc-200" />
                <div className="col-span-1 bg-transparent" />

                {/* Row 5: Face/Cheeks */}
                <div className="col-span-1 bg-transparent" />
                <div className="col-span-6 bg-zinc-200" />
                <div className="col-span-1 bg-transparent" />

                {/* Row 6: Mouth */}
                <div className="col-span-1 bg-transparent" />
                <div className="col-span-2 bg-zinc-200" />
                <div className="col-span-2 bg-zinc-800 transition-colors group-hover:bg-emerald-500/50" />
                <div className="col-span-2 bg-zinc-200" />
                <div className="col-span-1 bg-transparent" />

                {/* Row 7: Head Bottom */}
                <div className="col-span-1 bg-transparent" />
                <div className="col-span-6 bg-zinc-200" />
                <div className="col-span-1 bg-transparent" />

                {/* Row 8: Neck/Base */}
                <div className="col-span-2 bg-transparent" />
                <div className="col-span-4 bg-zinc-600" />
                <div className="col-span-2 bg-transparent" />
            </div>
        </div>
    );
};
