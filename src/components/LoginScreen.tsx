import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { KeyRound, Mail, ShieldAlert, Sparkles, User, Sun, Moon, Shield } from 'lucide-react';
import { UserProfile } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function LoginScreen({ onLoginSuccess, theme, toggleTheme }: LoginScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  
  // Login / Register states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'telecaller'>('admin');
  const [adminPasscode, setAdminPasscode] = useState('');
  
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
    if (role === 'admin') {
      const requiredPasscode = import.meta.env.VITE_ADMIN_REGISTRATION_KEY || 'FINESSE-ADMIN-2026';
      if (!adminPasscode.trim()) {
        setErrorMsg('Admin Passcode is required to register as an Administrator!');
        return;
      }
      if (adminPasscode.trim() !== requiredPasscode) {
        setErrorMsg('Unauthorized Admin Passcode. Please enter the correct secret key to proceed.');
        return;
      }
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 relative overflow-hidden px-4">
      {/* Floating Theme Switcher Button */}
      <div className="absolute top-6 right-6 z-50">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all duration-300 flex items-center justify-center shadow-lg relative group overflow-hidden"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun size={18} className="animate-spin-slow transition-transform" />
          ) : (
            <Moon size={18} className="transition-transform" />
          )}
        </button>
      </div>
      {/* Decorative glowing blobs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-650/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-650/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 shadow-2xl relative">
        <div className="text-center mb-8">
          {/* Sleek Brand Logo Icon */}
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-100 mb-5 shadow-inner select-none">
            <span className="text-2xl font-black tracking-tighter">L<span className="text-indigo-500">.</span></span>
          </div>
          {/* Sleek Text Logo */}
          <div className="flex items-end justify-center gap-1">
            <h1 className="text-3xl font-black text-zinc-100 tracking-[0.2em] translate-x-[0.1em] select-none">
              LEADFLOW
            </h1>
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 mb-2 animate-pulse"></span>
          </div>
          <p className="text-zinc-500 text-xs uppercase font-bold tracking-[0.15em] mt-3">
            Unified Admin & Caller Workspace
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 mb-6">
          <button
            onClick={() => { 
              setIsRegister(false); 
              setErrorMsg(''); 
              setSuccessMsg(''); 
              setAdminPasscode('');
              setRole('admin');
            }}
            className={`flex-1 pb-3 text-sm font-bold transition-colors ${!isRegister ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { 
              setIsRegister(true); 
              setErrorMsg(''); 
              setSuccessMsg(''); 
              setAdminPasscode('');
              setRole('admin');
            }}
            className={`flex-1 pb-3 text-sm font-bold transition-colors ${isRegister ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
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
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Staff Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 placeholder-zinc-650 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                  <KeyRound size={18} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 placeholder-zinc-650 outline-none text-sm transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-white hover:bg-zinc-100 text-zinc-950 font-black rounded-xl text-sm transition shadow-lg shadow-black/30 disabled:opacity-50 flex justify-center items-center select-none"
            >
              {isLoading ? 'Authenticating...' : 'Sign In to Workspace'}
            </button>
          </form>
        ) : (
          // REGISTER FORM
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 placeholder-zinc-650 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 placeholder-zinc-650 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                  <KeyRound size={18} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-950/80 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 placeholder-zinc-650 outline-none text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Workspace Role
              </label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as any);
                  setAdminPasscode('');
                }}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 outline-none text-sm transition"
              >
                <option value="admin">Administrator Dashboard</option>
                <option value="telecaller">Telecaller (Calling Agent)</option>
              </select>
            </div>

            {role === 'admin' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Admin Passcode / Secret Key
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                    <Shield size={18} />
                  </span>
                  <input
                    type="password"
                    required
                    placeholder="Enter admin passcode"
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-950/80 border border-zinc-805 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-100 placeholder-zinc-650 outline-none text-sm transition rounded-xl"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-white hover:bg-zinc-100 text-zinc-950 font-black rounded-xl text-sm transition shadow-lg shadow-black/30 disabled:opacity-50 flex justify-center items-center select-none"
            >
              {isLoading ? 'Creating Account...' : 'Register & Enter Workspace'}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-zinc-800/80">
          <div className="text-center text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">
            Sandbox Demo Accounts
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDemoLogin('admin')}
              disabled={isLoading}
              className="py-2.5 px-4 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 rounded-xl text-xs text-zinc-300 font-bold tracking-wide transition shadow-sm"
            >
              Demo Admin
            </button>
            <button
              onClick={() => handleDemoLogin('telecaller')}
              disabled={isLoading}
              className="py-2.5 px-4 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 rounded-xl text-xs text-zinc-300 font-bold tracking-wide transition shadow-sm"
            >
              Demo Telecaller
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
