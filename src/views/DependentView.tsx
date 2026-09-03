import { Mic, MicOff, Activity } from 'lucide-react';
import { FluidOrb } from '../components/FluidOrb';
import { useMumAI } from '../hooks/useMumAI';
import { motion } from 'motion/react';

export function DependentView({ userId }: { userId: string }) {
  const { state, volume, toggleListening } = useMumAI('dependent', userId);

  return (
    <div className="flex-1 flex flex-col justify-between items-center px-6 bg-[#0B0F19] overflow-hidden relative">
      {/* Background ambient grid/glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-sky-900/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full mt-12 flex flex-col items-center z-10">
        <h2 className="text-sm tracking-widest uppercase text-slate-500 font-semibold mb-1">Maa Companion</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${state !== 'idle' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <p className="text-slate-300 font-medium">
            {state === 'idle' ? 'Standby' : state === 'listening' ? 'Listening...' : state === 'thinking' ? 'Processing...' : 'Speaking'}
          </p>
        </div>
      </div>

      <div className="w-full flex-1 flex items-center justify-center z-10">
        <FluidOrb state={state} volume={volume} />
      </div>

      <div className="pb-16 pt-8 w-full flex flex-col items-center z-10">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleListening}
          className={`relative group flex items-center justify-center w-20 h-20 rounded-full shadow-2xl transition-all duration-300 ${
            state === 'idle'
              ? 'bg-slate-800/80 backdrop-blur-xl border border-slate-700 hover:bg-slate-700/80 text-cyan-400'
              : 'bg-rose-500/10 backdrop-blur-xl border border-rose-500/50 hover:bg-rose-500/20 text-rose-400'
          }`}
          aria-label={state === 'idle' ? "Connect to Maa" : "Disconnect"}
        >
          {/* Subtle pulse behind button when active */}
          {state !== 'idle' && (
            <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
          )}
          
          {state === 'idle' ? (
            <Mic size={32} strokeWidth={1.5} />
          ) : (
            <MicOff size={32} strokeWidth={1.5} />
          )}
        </motion.button>
        <p className="mt-4 text-xs font-medium text-slate-500 uppercase tracking-widest">
          {state === 'idle' ? 'Tap to Connect' : 'Tap to Disconnect'}
        </p>
      </div>
    </div>
  );
}
