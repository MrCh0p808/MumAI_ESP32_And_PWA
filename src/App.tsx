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

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userRole = await getUserRole(currentUser.uid);
          setRole(userRole);
        } catch (e) {
          console.warn("Could not fetch user role, defaulting to dependent:", e);
          setRole('dependent');
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      // Helpful diagnosis for domain authorization or popup blockage
      if (err?.code === 'auth/unauthorized-domain') {
        setAuthError(`This domain is not yet in Firebase's Authorized Domains list. Add '${window.location.hostname}' in Firebase Console -> Authentication -> Settings -> Authorized Domains.`);
      } else if (err?.code === 'auth/popup-blocked') {
        setAuthError("Popup blocked by browser. Please allow popups for this site or use Guest Access below.");
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError("Sign-in cancelled.");
      } else {
        setAuthError(err?.message || "Authentication failed. You can use Quick Guest Access below.");
      }
    }
  };

  const handleGuestSignIn = (selectedRole: 'dependent' | 'caregiver') => {
    // Instant developer/guest bypass without requiring Google Auth popups
    const guestUser: any = {
      uid: 'guest_' + Math.random().toString(36).substring(2, 9),
      displayName: 'Guest Pilot',
      email: 'pilot@mumaicompanion.local',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
    };
    setUser(guestUser);
    setRole(selectedRole);
  };

  const handleSetRole = async (selectedRole: 'dependent' | 'caregiver') => {
    if (user) {
      try {
        await createUserProfile(user.uid, user.displayName || 'User', user.email || '', selectedRole);
      } catch (e) {
        console.warn("Could not persist profile to Firestore:", e);
      }
      setRole(selectedRole);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center text-cyan-500 font-sans tracking-widest text-sm uppercase">Initializing...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center font-sans relative overflow-hidden px-4">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-900/20 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 max-w-md w-full bg-slate-900/70 backdrop-blur-2xl p-8 sm:p-10 rounded-3xl shadow-2xl border border-white/10 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner border border-white/10 rotate-3 hover:rotate-0 transition-all">
            <UserIcon size={28} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-light text-slate-100 mb-1">Maa Companion</h1>
          <p className="text-slate-400 mb-6 text-sm font-medium">Voice-First Indian Caregiver & Companion</p>

          {authError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-left leading-relaxed">
              <span className="font-semibold block mb-1">Notice:</span>
              {authError}
            </div>
          )}

          <button 
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-cyan-600/90 text-white font-medium hover:bg-cyan-500 active:bg-cyan-700 transition-all shadow-[0_0_20px_rgba(8,145,178,0.3)] hover:shadow-[0_0_30px_rgba(8,145,178,0.5)] border border-cyan-400/20"
          >
            <LogIn size={18} />
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-3 text-slate-500 font-mono tracking-wider">or instant developer access</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleGuestSignIn('dependent')}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition-all text-center"
            >
              🎙️ Dependent (Maa)
            </button>
            <button
              onClick={() => handleGuestSignIn('caregiver')}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition-all text-center"
            >
              📊 Caregiver Dash
            </button>
          </div>
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
      <div className="absolute top-6 right-6 z-40 flex items-center gap-3">
        {/* Quick View Switcher */}
        <div className="flex bg-slate-900/60 backdrop-blur-xl rounded-full p-1 border border-white/10 shadow-lg text-xs">
          <button
            onClick={() => setRole('dependent')}
            className={`px-3 py-1.5 rounded-full font-medium transition-all ${
              role === 'dependent'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🎙️ Dependent
          </button>
          <button
            onClick={() => setRole('caregiver')}
            className={`px-3 py-1.5 rounded-full font-medium transition-all ${
              role === 'caregiver'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📊 Caregiver
          </button>
        </div>

        <button 
          onClick={logout}
          className="group flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 backdrop-blur-xl rounded-full shadow-lg border border-white/5 text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800/80 text-xs"
          title="Sign Out"
        >
          {user.photoURL ? (
            <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-white/10" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs">
              {user.displayName?.charAt(0) || 'U'}
            </div>
          )}
          <span className="hidden sm:inline font-medium text-slate-300">{user.displayName?.split(' ')[0] || 'User'}</span>
          <LogOut size={14} className="group-hover:translate-x-0.5 transition-transform text-slate-400" />
        </button>
      </div>
      
      {role === 'dependent' ? <DependentView userId={user.uid} /> : <CaregiverView userId={user.uid} />}
    </div>
  );
}
