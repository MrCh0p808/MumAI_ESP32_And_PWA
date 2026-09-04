import { motion } from 'motion/react';
import { AgentState } from '../types';

export function FluidOrb({ state, volume = 0 }: { state: AgentState, volume?: number }) {
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';
  
  // Mathematical scaling based on state and volume telemetry (VU meter)
  const baseScale = isSpeaking ? 1.05 : isListening ? 1 : isThinking ? 1.02 : 0.95;
  const volDelta = Math.min((volume / 100) * 0.35, 0.35);
  const targetScale = baseScale + volDelta;

  // Concentric ripple styling by state
  const rippleColor = isSpeaking 
    ? 'rgba(16, 185, 129, 0.25)' 
    : isListening 
    ? 'rgba(56, 189, 248, 0.25)' 
    : isThinking 
    ? 'rgba(245, 158, 11, 0.25)' 
    : 'rgba(71, 85, 105, 0.1)';
  
  return (
    <div className="relative flex items-center justify-center w-full max-w-[320px] aspect-square mx-auto my-8">
      {/* Outer Concentric Animated Ripples for Listening/Speaking/Thinking */}
      {(isListening || isSpeaking || isThinking) && (
        <>
          <motion.div
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: [1, 1.45, 1.6], opacity: [0.5, 0.2, 0] }}
            transition={{ duration: isSpeaking ? 1.4 : 2.2, repeat: Infinity, ease: "easeOut" }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: `2px solid ${rippleColor}` }}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: [1, 1.25, 1.4], opacity: [0.6, 0.3, 0] }}
            transition={{ duration: isSpeaking ? 1.4 : 2.2, delay: 0.5, repeat: Infinity, ease: "easeOut" }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: `1.5px solid ${rippleColor}` }}
          />
        </>
      )}

      {/* Ambient background bloom */}
      <motion.div
        animate={{
          scale: isSpeaking ? [1, 1.25, 1] : isThinking ? [1, 1.1, 1] : 1,
          opacity: isSpeaking ? 0.45 : isListening ? 0.25 : isThinking ? 0.35 : 0.1,
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0 rounded-full blur-[60px]"
        style={{
          background: isSpeaking 
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
            : isListening 
            ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' 
            : isThinking
            ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
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
          rotate: isSpeaking ? 360 : isThinking ? [0, 180, 360] : 0
        }}
        transition={{
          borderRadius: { duration: 4, ease: "easeInOut", repeat: Infinity },
          scale: { duration: 0.08, ease: "easeOut" },
          rotate: { duration: isSpeaking ? 16 : 8, ease: "linear", repeat: Infinity }
        }}
        className="relative z-10 w-full h-full backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
        style={{
          background: isSpeaking 
            ? 'radial-gradient(circle at 30% 30%, rgba(16, 185, 129, 0.85), rgba(5, 150, 105, 0.95))'
            : isListening
            ? 'radial-gradient(circle at 30% 30%, rgba(56, 189, 248, 0.6), rgba(2, 132, 199, 0.85))'
            : isThinking
            ? 'radial-gradient(circle at 30% 30%, rgba(245, 158, 11, 0.75), rgba(180, 83, 9, 0.9))'
            : 'radial-gradient(circle at 30% 30%, rgba(51, 65, 85, 0.6), rgba(15, 23, 42, 0.9))',
          boxShadow: isSpeaking 
            ? `0 0 ${40 + volume}px rgba(16, 185, 129, 0.5), inset 0 0 40px rgba(255,255,255,0.2)` 
            : isListening
            ? `0 0 ${30 + (volume * 0.5)}px rgba(56, 189, 248, 0.4), inset 0 0 20px rgba(255,255,255,0.15)`
            : isThinking
            ? "0 0 35px rgba(245, 158, 11, 0.4), inset 0 0 25px rgba(255,255,255,0.15)"
            : "0 0 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.05)"
        }}
      >
        {/* Specular highlights for glass depth */}
        <div className="absolute top-[10%] left-[15%] w-[30%] h-[30%] rounded-full bg-white/30 blur-2xl" />
        <div className="absolute top-[20%] left-[25%] w-[15%] h-[15%] rounded-full bg-white/50 blur-md transform -rotate-45" />
      </motion.div>
    </div>
  );
}
