import { motion } from 'motion/react';
import { AgentState } from '../types';

export function FluidOrb({ state, volume = 0 }: { state: AgentState, volume?: number }) {
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening' || state === 'thinking';
  
  // Mathematical scaling based on state and volume telemetry
  const baseScale = isSpeaking ? 1.05 : isListening ? 1 : 0.95;
  const volDelta = Math.min((volume / 100) * 0.3, 0.3);
  const targetScale = baseScale + volDelta;
  
  return (
    <div className="relative flex items-center justify-center w-full max-w-[280px] aspect-square mx-auto my-12">
      {/* Outer ambient glow */}
      <motion.div
        animate={{
          scale: isSpeaking ? [1, 1.2, 1] : 1,
          opacity: isSpeaking ? 0.4 : isListening ? 0.2 : 0.1,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0 rounded-full blur-[60px]"
        style={{
          background: isSpeaking 
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
            : isListening 
            ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' 
            : '#475569'
        }}
      />

      {/* Core interactive geometry */}
      <motion.div
        animate={{
          borderRadius: [
            "50% 50% 50% 50% / 50% 50% 50% 50%",
            "55% 45% 48% 52% / 52% 55% 45% 48%",
            "45% 55% 52% 48% / 48% 45% 55% 52%",
            "50% 50% 50% 50% / 50% 50% 50% 50%"
          ],
          scale: targetScale,
          rotate: isSpeaking ? 360 : 0
        }}
        transition={{
          borderRadius: { duration: 4, ease: "easeInOut", repeat: Infinity },
          scale: { duration: 0.1, ease: "easeOut" },
          rotate: { duration: 20, ease: "linear", repeat: Infinity }
        }}
        className="relative z-10 w-full h-full backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
        style={{
          background: isSpeaking 
            ? 'radial-gradient(circle at 30% 30%, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.9))'
            : isListening
            ? 'radial-gradient(circle at 30% 30%, rgba(56, 189, 248, 0.5), rgba(2, 132, 199, 0.8))'
            : 'radial-gradient(circle at 30% 30%, rgba(51, 65, 85, 0.6), rgba(15, 23, 42, 0.9))',
          boxShadow: isSpeaking 
            ? `0 0 ${40 + volume}px rgba(16, 185, 129, 0.5), inset 0 0 40px rgba(255,255,255,0.2)` 
            : isListening
            ? "0 0 30px rgba(56, 189, 248, 0.3), inset 0 0 20px rgba(255,255,255,0.1)"
            : "0 0 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.05)"
        }}
      >
        {/* Specular highlight for premium glass effect */}
        <div className="absolute top-[10%] left-[15%] w-[30%] h-[30%] rounded-full bg-white/30 blur-2xl" />
        <div className="absolute top-[20%] left-[25%] w-[15%] h-[15%] rounded-full bg-white/50 blur-md transform -rotate-45" />
      </motion.div>
    </div>
  );
}
