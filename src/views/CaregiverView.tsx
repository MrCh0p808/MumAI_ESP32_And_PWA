import { Activity, ShieldAlert, Wifi, Pill } from 'lucide-react';
import { useMumAI } from '../hooks/useMumAI';

export function CaregiverView({ userId }: { userId: string }) {
  const { metrics, transcript, memories } = useMumAI('caregiver', userId);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full pt-16">
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-slate-100">Caregiver Dashboard</h2>
        <p className="text-slate-400">Monitoring Dependent's Status</p>
      </header>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm font-medium">
            <Wifi size={18} /> Network
          </div>
          <p className={`text-xl font-bold ${metrics.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
            {metrics.connected ? 'Connected' : 'Offline'}
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm font-medium">
            <Activity size={18} /> Jitter
          </div>
          <p className="text-xl font-bold text-slate-100">{metrics.jitterPct.toFixed(2)}%</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm font-medium">
            <Activity size={18} /> Shimmer
          </div>
          <p className="text-xl font-bold text-slate-100">{metrics.shimmerDb.toFixed(2)} dB</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400 text-sm font-medium">
            <Activity size={18} /> Latency
          </div>
          <p className="text-xl font-bold text-slate-100">{metrics.latencyMs} ms</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Live Transcript */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col h-96 shadow-lg">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            Live Transcript
          </h3>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {transcript.length === 0 ? (
              <p className="text-slate-500 text-sm italic">No recent conversation...</p>
            ) : (
              transcript.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-slate-700 text-slate-200' 
                      : 'bg-cyan-900/40 text-cyan-100 border border-cyan-800/50'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-xs text-slate-500 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Episodic Memory */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col h-96 shadow-lg">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            Episodic Memory Logs
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {memories.map((memory) => (
              <div key={memory.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/50 flex gap-3">
                <div className="mt-1">
                  {memory.category === 'medical' && <Pill size={20} className="text-cyan-400" />}
                  {memory.category === 'alert' && <ShieldAlert size={20} className="text-rose-400" />}
                  {memory.category === 'routine' && <Activity size={20} className="text-emerald-400" />}
                </div>
                <div>
                  <p className="text-slate-200 text-sm font-medium">{memory.content}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(memory.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
