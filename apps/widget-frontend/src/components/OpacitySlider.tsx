import React from 'react';
import { useStore } from '../store';

export const OpacitySlider: React.FC = () => {
    const hasPlan = useStore((state) => state.scene.planImage !== null);
    const planOpacity = useStore((state) => state.planOpacity);
    const setPlanOpacity = useStore((state) => state.setPlanOpacity);
    const editorMode = useStore((state) => state.editorMode);

    // Only show if plan exists and we are in a mode where seeing the plan matters
    if (!hasPlan) return null;

    return (
        <div className="fixed right-3 md:right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-auto z-50">
            <div className="bg-white/60 backdrop-blur-xl border border-white/40 shadow-2xl rounded-full py-4 px-2 flex flex-col items-center gap-2">


                {/* Vertical Slider Wrapper */}
                <div className="h-32 w-2 relative flex items-center justify-center">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={planOpacity}
                        onChange={(e) => setPlanOpacity(parseFloat(e.target.value))}
                        className="absolute w-32 h-2 appearance-none bg-gray-300 rounded-full outline-none -rotate-90 origin-center cursor-pointer accent-blue-600"
                        style={{ top: '60px' }} // Approximate centering adjustment due to rotation
                    />
                </div>

                <div className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-600 bg-white/50 rounded-full shadow-sm">
                    {Math.round(planOpacity * 100)}%
                </div>
            </div>
        </div>
    );
};
