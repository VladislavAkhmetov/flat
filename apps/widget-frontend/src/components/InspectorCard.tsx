import React from 'react';

/** Compact inspector docked top-left so it never covers the bottom toolbars. */
export const InspectorCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="fixed z-30 left-3 top-[4.75rem] sm:left-4 sm:top-20 w-[min(19.5rem,calc(100vw-1.5rem))] pointer-events-auto animate-in fade-in slide-in-from-left-3 duration-200">
        <div className="bg-white/95 backdrop-blur-2xl border border-white/60 shadow-2xl rounded-2xl p-3.5 flex flex-col gap-3">
            {children}
        </div>
    </div>
);
