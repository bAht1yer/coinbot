"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
    hoverEffect?: boolean;
}

export const GlassCard = ({ children, className, hoverEffect = false, ...props }: GlassCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
                "rounded-xl p-6 relative overflow-hidden",
                "bg-zinc-950/80 border border-zinc-800/50 shadow-2xl shadow-black/50",
                hoverEffect && "hover:border-cyan-500/20 hover:shadow-cyan-500/5 transition-all duration-300",
                className
            )}
            {...props}
        >
            {/* Subtle top edge highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
            {children}
        </motion.div>
    );
};
