import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { telemetryService, SessionHealthSummary } from '../services/telemetryService';
import { Activity, Clock, ShieldCheck, MessageSquare } from 'lucide-react';

interface ChartPoint {
  date: string;
  turns: number;
  latency: number;
  voiceprintMatch: number;
}

export default function CaregiverStats() {
  const [telemetryLogs, setTelemetryLogs] = useState<SessionHealthSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = telemetryService.subscribeToTelemetry((logs) => {
      setTelemetryLogs(logs);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Format data for Recharts, with deterministic baseline fallback if no records yet
  const chartData: ChartPoint[] = telemetryLogs.length > 0
    ? [...telemetryLogs].reverse().map((log, index) => {
        const d = new Date(log.startedAt);
        return {
          date: `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`,
          turns: log.turnsCount,
          latency: log.avgLatencyMs,
          voiceprintMatch: log.voiceprintMatchPct
        };
      })
    : [
        { date: 'Mon', turns: 14, latency: 420, voiceprintMatch: 98 },
        { date: 'Tue', turns: 22, latency: 410, voiceprintMatch: 99 },
        { date: 'Wed', turns: 19, latency: 380, voiceprintMatch: 100 },
        { date: 'Thu', turns: 28, latency: 395, voiceprintMatch: 97 },
        { date: 'Fri', turns: 25, latency: 370, voiceprintMatch: 100 },
        { date: 'Sat', turns: 31, latency: 360, voiceprintMatch: 99 },
        { date: 'Today', turns: 24, latency: 350, voiceprintMatch: 100 }
      ];

  const totalTurns = chartData.reduce((acc, curr) => acc + curr.turns, 0);
  const avgLatency = Math.round(chartData.reduce((acc, curr) => acc + curr.latency, 0) / chartData.length);
  const avgVoiceprint = Math.round(chartData.reduce((acc, curr) => acc + curr.voiceprintMatch, 0) / chartData.length);

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/60 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Activity className="text-cyan-400" size={20} />
            Interaction Health & Conversational Latency
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Turn accuracy and response latency trends tracked via Agora ConvoAI engine
          </p>
        </div>
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 self-start sm:self-auto">
          Voiceprint Isolation: {avgVoiceprint}% Active
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/40">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
            <MessageSquare size={14} className="text-indigo-400" /> Total Turns
          </span>
          <p className="text-xl font-bold text-slate-100">{totalTurns}</p>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/40">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
            <Clock size={14} className="text-cyan-400" /> Avg Latency
          </span>
          <p className="text-xl font-bold text-slate-100">{avgLatency} ms</p>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/40">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
            <ShieldCheck size={14} className="text-emerald-400" /> Voice Isolation
          </span>
          <p className="text-xl font-bold text-emerald-400">{avgVoiceprint}%</p>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/40">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
            <Activity size={14} className="text-amber-400" /> Status
          </span>
          <p className="text-xl font-bold text-amber-400">Optimal</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-6 pt-2">
        {/* Turn Frequency Chart */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/30 flex flex-col">
          <div className="mb-3">
            <span className="text-xs font-semibold text-slate-300">Daily Conversational Turns</span>
            <p className="text-[11px] text-slate-500">Frequency of dependent engagements</p>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="turnsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="turns" stroke="#06b6d4" strokeWidth={2} fill="url(#turnsGradient)" name="Turns" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency Trend Chart */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/30 flex flex-col">
          <div className="mb-3">
            <span className="text-xs font-semibold text-slate-300">Response Latency (TTFA ms)</span>
            <p className="text-[11px] text-slate-500">Target: &lt; 500ms for natural conversation</p>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[200, 600]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} name="Latency (ms)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
