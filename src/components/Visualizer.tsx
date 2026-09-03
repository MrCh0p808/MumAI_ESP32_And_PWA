import { motion } from 'motion/react';
import { AgentState } from '../types';

export function Visualizer({ state }: { state: AgentState }) {
  const getAnimationProps = () => {
    switch (state) {
      case 'listening':
        return {
          scale: [1, 1.2, 1],
          opacity: [0.8, 1, 0.8],
          transition: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
        };
      case 'thinking':
        return {
          rotate: 360,
          scale: [1, 1.05, 1],
          transition: { rotate: { repeat: Infinity, duration: 2, ease: "linear" }, scale: { repeat: Infinity, duration: 1 } }
        };
      case 'speaking':
        return {
          scale: [1, 1.3, 1.1, 1.4, 1],
          opacity: [0.7, 1, 0.8, 1, 0.7],
          transition: { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
        };
      default:
        return {
          scale: [1, 1.05, 1],
          opacity: [0.5, 0.7, 0.5],
          transition: { repeat: Infinity, duration: 4, ease: "easeInOut" }
        };
    }
  };

  const getColor = () => {
    switch (state) {
      case 'listening': return 'bg-orange-400';
      case 'thinking': return 'bg-amber-400 border-dashed border-4 border-amber-600';
      case 'speaking': return 'bg-emerald-400';
      case 'error': return 'bg-rose-500';
      default: return 'bg-stone-300';
    }
  };

  return (
    <div className="relative flex items-center justify-center w-64 h-64 mx-auto my-8">
      <motion.div 
        className={`absolute inset-0 rounded-full blur-3xl opacity-40 ${getColor()}`}
        animate={getAnimationProps()}
      />
      <motion.div
        className={`relative z-10 w-48 h-48 rounded-full shadow-2xl flex items-center justify-center ${getColor()}`}
        animate={getAnimationProps()}
      >
          {state === 'idle' && <span className="text-stone-600 font-medium text-xl">Maa is resting</span>}
          {state === 'listening' && <span className="text-stone-900 font-bold text-xl">Listening...</span>}
          {state === 'thinking' && <span className="text-stone-900 font-bold text-xl">Thinking...</span>}
          {state === 'speaking' && <span className="text-stone-900 font-bold text-xl">Speaking...</span>}
      </motion.div>
    </div>
  );
}
