import { useState } from 'react';
import { Activity, Wifi, WifiOff, Battery, Mic } from 'lucide-react';
import { TelemetryMetrics } from '../types';

export function TelemetryHUD({ metrics }: { metrics: TelemetryMetrics }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div 
      onClick={() => setExpanded(!expanded)}
      className="absolute top-4 left-4 right-4 z-30 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-stone-200/50 p-5 cursor-pointer transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {metrics.connected ? (
            <Wifi size={28} className="text-emerald-500" />
          ) : (
            <WifiOff size={28} className="text-stone-400" />
          )}
          <span className="text-stone-800 font-bold text-xl tracking-tight">
            {metrics.connected ? 'Connected to Maa' : 'Connecting...'}
          </span>
        </div>
        <div className="flex items-center gap-5 text-stone-500">
          <span className="flex items-center gap-1 font-bold text-lg">
            <Battery size={24} />
            {metrics.batteryPct}%
          </span>
          <Activity size={28} className={metrics.jitterPct > 1.0 ? 'text-orange-500' : 'text-stone-400'} />
        </div>
      </div>

      {expanded && (
        <div className="mt-5 pt-5 border-t border-stone-200/80 grid grid-cols-2 gap-4">
           <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
             <p className="text-stone-500 text-sm mb-1 font-bold uppercase tracking-wider">Vocal Jitter</p>
             <p className={`text-2xl font-black ${metrics.jitterPct > 1.0 ? 'text-orange-600' : 'text-stone-800'}`}>
               {metrics.jitterPct.toFixed(2)}%
             </p>
           </div>
           <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
             <p className="text-stone-500 text-sm mb-1 font-bold uppercase tracking-wider">Shimmer</p>
             <p className={`text-2xl font-black ${metrics.shimmerDb > 3.0 ? 'text-orange-600' : 'text-stone-800'}`}>
               {metrics.shimmerDb.toFixed(2)} dB
             </p>
           </div>
           <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
             <p className="text-stone-500 text-sm mb-1 font-bold uppercase tracking-wider">Turn Latency</p>
             <p className="text-2xl font-black text-stone-800">
               {metrics.latencyMs} ms
             </p>
           </div>
           <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
             <p className="text-stone-500 text-sm mb-1 font-bold uppercase tracking-wider">Acoustic Guard</p>
             <p className="text-2xl font-black text-emerald-600 flex items-center gap-2">
               Active <Mic size={20} strokeWidth={3} />
             </p>
           </div>
        </div>
      )}
    </div>
  );
}
