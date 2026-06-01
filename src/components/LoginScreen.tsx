import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { KeyRound, Mail, ShieldAlert, Sparkles, User } from 'lucide-react';
import { UserProfile } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  
  // Login / Register states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'telecaller'>('admin');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password!');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // Fetch user profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as Omit<UserProfile, 'uid'>;
        onLoginSuccess({
          uid,
          name: profile.name || 'Agent',
          email: profile.email || email,
          role: profile.role || 'telecaller',
          active: profile.active === true
        });
      } else {
        await signOut(auth);
        setErrorMsg('User profile not found in database! Please register first.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !name.trim()) {
      setErrorMsg('Please fill in all fields!');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password should be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // 2. Set profile in Firestore users collection
      const profile = {
        name: name.trim(),
        email: email.trim(),
        role: role,
        active: true,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), profile);

      setSuccessMsg('Account registered successfully! Logging you in...');
      
      setTimeout(() => {
        onLoginSuccess({
          uid,
          ...profile
        });
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Registration failed.');
      setIsLoading(false);
    }
  };

  // Demo account helper login
  const handleDemoLogin = async (roleType: 'admin' | 'telecaller') => {
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const demoEmail = roleType === 'admin' ? 'admin@leadflow.com' : 'telecaller1@leadflow.com';
    const demoPassword = 'password123';

    try {
      const userCredential = await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      const uid = userCredential.user.uid;
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (userDoc.exists()) {
        const profile = userDoc.data() as Omit<UserProfile, 'uid'>;
        onLoginSuccess({
          uid,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          active: profile.active
        });
      } else {
        await signOut(auth);
        setErrorMsg('Demo profile not found in Firestore. Please use the Registration tab to create your own account!');
      }
    } catch (err: any) {
      setErrorMsg(`Demo Account not yet configured on this Firebase database. Please use the Registration tab above to create an account in 5 seconds!`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden px-4">
      {/* Decorative glowing blobs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-violet-600/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-violet-500/10 rounded-2xl border border-violet-500/20 text-violet-400 mb-4">
            <Sparkles size={28} />
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            LeadFlow CRM
          </h1>
          <p className="text-slate-400 text-sm mt-1">Unified Admin & Caller Workspace</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 mb-6">
          <button
            onClick={() => { setIsRegister(false); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 pb-3 text-sm font-bold transition-colors ${!isRegister ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setIsRegister(true); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 pb-3 text-sm font-bold transition-colors ${isRegister ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Register Account
          </button>
        </div>

        {errorMsg && (
          <div className="mb-6 flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded-xl">
            <Sparkles size={20} className="shrink-0 mt-0.5" />
            <p>{successMsg}</p>
          </div>
        )}

        {/* Dynamic Form */}
        {!isRegister ? (
          // LOGIN FORM
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Staff Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <KeyRound size={18} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-violet-900/20 disabled:opacity-50 flex justify-center items-center"
            >
              {isLoading ? 'Authenticating...' : 'Sign In to Workspace'}
            </button>
          </form>
        ) : (
          // REGISTER FORM
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <KeyRound size={18} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Workspace Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 outline-none text-sm transition"
              >
                <option value="admin">Administrator Dashboard</option>
                <option value="telecaller">Telecaller (Kalling Agent)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-violet-900/20 disabled:opacity-50 flex justify-center items-center"
            >
              {isLoading ? 'Creating Account...' : 'Register & Enter Workspace'}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Sandbox Demo Accounts
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDemoLogin('admin')}
              disabled={isLoading}
              className="py-2.5 px-4 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-300 font-medium transition"
            >
              Demo Admin
            </button>
            <button
              onClick={() => handleDemoLogin('telecaller')}
              disabled={isLoading}
              className="py-2.5 px-4 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-300 font-medium transition"
            >
              Demo Telecaller
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
