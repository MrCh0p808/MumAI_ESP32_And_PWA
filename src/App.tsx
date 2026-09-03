import { useState, useEffect } from 'react';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { auth, signInWithGoogle, logout } from './lib/firebase';
import { getUserRole, createUserProfile, UserRole } from './lib/db';
import { onAuthStateChanged, User } from 'firebase/auth';
import { DependentView } from './views/DependentView';
import { CaregiverView } from './views/CaregiverView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRole = await getUserRole(currentUser.uid);
        setRole(userRole);
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSetRole = async (selectedRole: 'dependent' | 'caregiver') => {
    if (user) {
      await createUserProfile(user.uid, user.displayName || 'User', user.email || '', selectedRole);
      setRole(selectedRole);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center text-cyan-500 font-sans tracking-widest text-sm uppercase">Initializing...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-900/20 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 max-w-sm w-full bg-slate-900/50 backdrop-blur-2xl p-10 rounded-3xl shadow-2xl border border-white/5 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner border border-white/10 rotate-3 hover:rotate-0 transition-all">
            <UserIcon size={28} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-light text-slate-100 mb-2">Access Portal</h1>
          <p className="text-slate-400 mb-10 text-sm font-medium">Secure authorization required.</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-cyan-600/90 text-white font-medium hover:bg-cyan-500 active:bg-cyan-700 transition-all shadow-[0_0_20px_rgba(8,145,178,0.3)] hover:shadow-[0_0_30px_rgba(8,145,178,0.5)] border border-cyan-400/20"
          >
            <LogIn size={18} />
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center font-sans p-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-900/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 max-w-md w-full bg-slate-900/50 backdrop-blur-2xl p-10 rounded-3xl shadow-2xl border border-white/5">
          <h2 className="text-xl font-light text-slate-100 mb-8 text-center">Select Profile Type</h2>
          <div className="space-y-4">
            <button 
              onClick={() => handleSetRole('dependent')}
              className="group w-full p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 text-left transition-all relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="text-lg font-medium text-slate-100 relative z-10">Dependent</h3>
              <p className="text-sm text-slate-400 mt-1 relative z-10">Connect to your voice companion.</p>
            </button>
            <button 
              onClick={() => handleSetRole('caregiver')}
              className="group w-full p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/30 text-left transition-all relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="text-lg font-medium text-slate-100 relative z-10">Caregiver</h3>
              <p className="text-sm text-slate-400 mt-1 relative z-10">Monitor telemetry and episodic logs.</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] flex flex-col font-sans overflow-hidden relative selection:bg-cyan-500/30">
      {/* Universal Header */}
      <div className="absolute top-6 right-6 z-40">
        <button 
          onClick={logout}
          className="group flex items-center gap-3 px-3 py-2 bg-slate-900/50 backdrop-blur-xl rounded-full shadow-lg border border-white/5 text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800/80"
          title="Sign Out"
        >
          <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full border border-white/10" />
          <LogOut size={16} className="mr-1 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
      
      {role === 'dependent' ? <DependentView userId={user.uid} /> : <CaregiverView userId={user.uid} />}
    </div>
  );
}
