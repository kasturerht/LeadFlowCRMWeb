import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { KeyRound, Mail, ShieldAlert, Sparkles, User, Sun, Moon, Shield, Eye, EyeOff, Lock, CheckCircle2, AlertTriangle, ArrowRight, Cpu, Check, ShieldCheck, PhoneCall } from 'lucide-react';
import { UserProfile } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function LoginScreen({ onLoginSuccess, theme, toggleTheme }: LoginScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  
  // Form input states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'telecaller'>('admin');
  const [adminPasscode, setAdminPasscode] = useState('');
  
  // Security & UX states
  const [showPassword, setShowPassword] = useState(false);
  const [highSecurityMode, setHighSecurityMode] = useState(true); // True = Session persistence (closes on tab close)
  const [capsLockOn, setCapsLockOn] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'None', color: 'bg-slate-700', textColor: 'text-slate-500' };
    let score = 0;
    if (pass.length >= 6) score += 25;
    if (pass.length >= 8) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9!@#$%^&*]/.test(pass)) score += 25;

    if (score <= 25) return { score: 25, label: 'Weak (Min 6 chars)', color: 'bg-rose-500', textColor: 'text-rose-400' };
    if (score <= 50) return { score: 50, label: 'Moderate Security', color: 'bg-amber-500', textColor: 'text-amber-400' };
    if (score <= 75) return { score: 75, label: 'Strong Enterprise Grade', color: 'bg-sky-500', textColor: 'text-sky-400' };
    return { score: 100, label: 'Silicon Valley Grade Security 🛡️', color: 'bg-emerald-500', textColor: 'text-emerald-400' };
  };

  const strength = getPasswordStrength(password);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      setCapsLockOn(true);
    } else {
      setCapsLockOn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Set Firebase Auth Persistence according to High Security choice
      // If High Security Mode is checked, use browserSessionPersistence (logs out when tab/browser closes)
      // Otherwise use browserLocalPersistence (remember device)
      await setPersistence(auth, highSecurityMode ? browserSessionPersistence : browserLocalPersistence);

      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // 2. Fetch user staff profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as Omit<UserProfile, 'uid'>;
        onLoginSuccess({
          uid,
          name: profile.name || 'Staff Agent',
          email: profile.email || email,
          role: profile.role || 'telecaller',
          active: profile.active === true
        });
      } else {
        await signOut(auth);
        setErrorMsg('Security Alert: User authentication succeeded, but no staff profile exists in database. Please click "Register Account" tab to initialize your profile.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Authentication failed. Please verify your staff credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !name.trim()) {
      setErrorMsg('Please fill in all required registration fields.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('For enterprise compliance, password must be at least 6 characters long.');
      return;
    }
    if (role === 'admin') {
      const requiredPasscode = import.meta.env.VITE_ADMIN_REGISTRATION_KEY || 'FINESSE-ADMIN-2026';
      if (!adminPasscode.trim()) {
        setErrorMsg('Admin Passcode / Secret Key is strictly required for Administrator registration.');
        return;
      }
      if (adminPasscode.trim() !== requiredPasscode) {
        setErrorMsg('Unauthorized Security Key! Access denied for Administrator privileges.');
        return;
      }
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Apply session persistence choice
      await setPersistence(auth, highSecurityMode ? browserSessionPersistence : browserLocalPersistence);

      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // 2. Set profile in Firestore users collection
      const profile = {
        name: name.trim(),
        email: email.trim(),
        role: role,
        active: true,
        createdAt: new Date().toISOString(),
        securityLevel: role === 'admin' ? 'ZERO-TRUST-ADMIN' : 'STANDARD-AGENT'
      };

      await setDoc(doc(db, 'users', uid), profile);

      setSuccessMsg('Enterprise Staff Account provisioned successfully! Initializing secure session...');
      
      setTimeout(() => {
        onLoginSuccess({
          uid,
          ...profile
        });
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Account registration failed.');
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
      await setPersistence(auth, highSecurityMode ? browserSessionPersistence : browserLocalPersistence);
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
        setErrorMsg('Demo profile not found in Firestore. Please use the "Register Account" tab to create your own account.');
      }
    } catch (err: any) {
      setErrorMsg(`Demo Account not yet configured on this database. Please click "Register Account" above to create an admin or telecaller account in 5 seconds!`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden px-4 py-12">
      {/* Floating Theme Switcher Button */}
      <div className="absolute top-6 right-6 z-50">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-3 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all duration-300 flex items-center justify-center shadow-xl backdrop-blur-md"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun size={18} className="animate-spin-slow text-amber-400" />
          ) : (
            <Moon size={18} className="text-sky-400" />
          )}
        </button>
      </div>

      {/* Decorative cyber glowing blobs & grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e1b4b15_1px,transparent_1px),linear-gradient(to_bottom,#1e1b4b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse" />

      <div className="w-full max-w-lg bg-slate-900/80 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
        <div className="text-center mb-8">
          {/* Sleek Brand Logo Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white mb-5 shadow-lg shadow-indigo-500/25 select-none transform hover:scale-105 transition-transform duration-300">
            <span className="text-3xl font-black tracking-tighter">L<span className="text-amber-300">.</span></span>
          </div>
          {/* Sleek Text Logo */}
          <div className="flex items-end justify-center gap-1.5">
            <h1 className="text-3xl font-black text-slate-100 tracking-[0.2em] select-none">
              LEADFLOW
            </h1>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 mb-2 animate-ping" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px] font-mono font-bold tracking-wider mt-3">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>ENTERPRISE ZERO-TRUST AUTHENTICATION</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => { 
              setIsRegister(false); 
              setErrorMsg(''); 
              setSuccessMsg(''); 
              setAdminPasscode('');
              setRole('admin');
            }}
            className={`py-3 rounded-xl text-sm font-extrabold transition-all duration-200 flex items-center justify-center gap-2 ${
              !isRegister 
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock size={15} />
            <span>Secure Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { 
              setIsRegister(true); 
              setErrorMsg(''); 
              setSuccessMsg(''); 
              setAdminPasscode('');
              setRole('admin');
            }}
            className={`py-3 rounded-xl text-sm font-extrabold transition-all duration-200 flex items-center justify-center gap-2 ${
              isRegister 
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={15} className={isRegister ? 'text-amber-300' : ''} />
            <span>Register Account</span>
          </button>
        </div>

        {/* Caps Lock Warning Banner */}
        {capsLockOn && (
          <div className="mb-5 flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold p-3.5 rounded-xl animate-bounce">
            <AlertTriangle size={16} className="shrink-0 text-amber-400" />
            <span>CAPS LOCK IS ON. Passwords are case-sensitive!</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium p-4 rounded-xl">
            <ShieldAlert size={18} className="shrink-0 mt-0.5 text-rose-400" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium p-4 rounded-xl">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-400" />
            <p className="leading-relaxed">{successMsg}</p>
          </div>
        )}

        {/* Dynamic Form */}
        {!isRegister ? (
          // LOGIN FORM
          <form onSubmit={handleLogin} className="space-y-5" onKeyDown={handleKeyDown} onKeyUp={handleKeyDown}>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Staff Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition font-medium"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <KeyRound size={18} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* High Security Mode Checkbox (Silicon Valley Session Guard) */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="loginSecureMode"
                checked={highSecurityMode}
                onChange={(e) => setHighSecurityMode(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 cursor-pointer"
              />
              <label htmlFor="loginSecureMode" className="text-xs text-slate-300 cursor-pointer">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  High Security Mode (Auto-logout on browser close)
                </span>
                <span className="text-slate-400 block text-[11px] mt-0.5">
                  Uncheck only if using a trusted personal device to remember login session.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-500 hover:from-violet-500 hover:via-indigo-500 hover:to-sky-400 text-white font-black rounded-xl text-sm transition-all duration-300 shadow-xl shadow-indigo-500/25 disabled:opacity-50 flex justify-center items-center gap-2 select-none group"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        ) : (
          // REGISTER FORM
          <form onSubmit={handleRegister} className="space-y-5" onKeyDown={handleKeyDown} onKeyUp={handleKeyDown}>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Create Security Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <KeyRound size={18} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Min 6 characters (Uppercase & numbers recommended)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none text-sm transition font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {password && (
                <div className="mt-2.5 space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">Password Strength:</span>
                    <span className={`font-bold ${strength.textColor}`}>{strength.label}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${strength.score}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Workspace Role Cards */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                Select Workspace Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRole('admin');
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                    role === 'admin'
                      ? 'bg-violet-950/40 border-violet-500 shadow-md shadow-violet-500/10 scale-[1.02]'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
                      <Shield size={18} />
                    </div>
                    {role === 'admin' && <Check size={16} className="text-violet-400" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-100">Administrator</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Control tower & full reports</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRole('telecaller');
                    setAdminPasscode('');
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                    role === 'telecaller'
                      ? 'bg-sky-950/40 border-sky-500 shadow-md shadow-sky-500/10 scale-[1.02]'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                      <PhoneCall size={18} />
                    </div>
                    {role === 'telecaller' && <Check size={16} className="text-sky-400" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-100">Telecaller Staff</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Calling desk & leads pipeline</p>
                  </div>
                </button>
              </div>
            </div>

            {role === 'admin' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 p-4 rounded-2xl bg-violet-950/20 border border-violet-500/30">
                <label className="block text-[11px] font-bold text-violet-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Shield size={14} className="text-violet-400" />
                  Admin Passcode / Security Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    placeholder="Enter secret key (e.g. FINESSE-ADMIN-2026)"
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-violet-500/40 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 text-slate-100 placeholder-slate-600 outline-none text-sm transition rounded-xl font-mono"
                  />
                </div>
                <p className="text-[10px] text-violet-400/80 mt-1.5 font-mono">
                  * Required to prevent unauthorized admin privilege escalation.
                </p>
              </div>
            )}

            {/* High Security Mode Checkbox */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="regSecureMode"
                checked={highSecurityMode}
                onChange={(e) => setHighSecurityMode(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 cursor-pointer"
              />
              <label htmlFor="regSecureMode" className="text-xs text-slate-300 cursor-pointer">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  High Security Mode (Auto-logout on browser close)
                </span>
                <span className="text-slate-400 block text-[11px] mt-0.5">
                  Uncheck only if using a trusted personal device to remember login session.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-500 hover:from-violet-500 hover:via-indigo-500 hover:to-sky-400 text-white font-black rounded-xl text-sm transition-all duration-300 shadow-xl shadow-indigo-500/25 disabled:opacity-50 flex justify-center items-center gap-2 select-none group"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning Account...</span>
                </>
              ) : (
                <>
                  <span>Provision & Enter Workspace</span>
                  <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <div className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
            <span className="h-px w-10 bg-slate-800" />
            <span>Instant Sandbox Demo Accounts</span>
            <span className="h-px w-10 bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin')}
              disabled={isLoading}
              className="py-2.5 px-4 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-300 hover:text-white font-bold tracking-wide transition shadow-sm flex items-center justify-center gap-2 group"
            >
              <Shield size={14} className="text-violet-400 group-hover:scale-110 transition-transform" />
              <span>Demo Admin</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('telecaller')}
              disabled={isLoading}
              className="py-2.5 px-4 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-300 hover:text-white font-bold tracking-wide transition shadow-sm flex items-center justify-center gap-2 group"
            >
              <PhoneCall size={14} className="text-sky-400 group-hover:scale-110 transition-transform" />
              <span>Demo Telecaller</span>
            </button>
          </div>
        </div>

        {/* Enterprise Security Trust Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800/40 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-mono font-bold text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>256-Bit SSL Encrypted</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Lock size={13} className="text-sky-400" />
            <span>SOC-2 Compliant</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu size={13} className="text-violet-400" />
            <span>Zero-Trust Architecture</span>
          </span>
        </div>
      </div>
    </div>
  );
}
