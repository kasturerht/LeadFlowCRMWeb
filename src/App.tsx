import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import TelecallerDashboard from './components/TelecallerDashboard';
import { ShieldAlert } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Simulation switcher (Admin can simulate telecaller view)
  const [simulateTelecaller, setSimulateTelecaller] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const profile = docSnap.data() as Omit<UserProfile, 'uid'>;
            setCurrentUser({
              uid: user.uid,
              name: profile.name || 'Agent',
              email: profile.email || user.email || '',
              role: profile.role || 'telecaller',
              active: profile.active === true
            });
          } else {
            setCurrentUser(null);
          }
        } catch (err) {
          console.error("Auth user profile load error:", err);
          setCurrentUser(null);
        } finally {
          setIsLoading(false);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      setCurrentUser(null);
      setSimulateTelecaller(false);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!authChecked || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Syncing Workspace State...</p>
      </div>
    );
  }

  // Not logged in
  if (!currentUser) {
    return (
      <LoginScreen 
        onLoginSuccess={(profile) => {
          setCurrentUser(profile);
        }} 
      />
    );
  }

  // Admin simulation of telecaller console
  if (currentUser.role === 'admin' && simulateTelecaller) {
    // Create a simulated telecaller profile based on the admin
    const simulatedProfile: UserProfile = {
      uid: currentUser.uid,
      name: `Simulated: ${currentUser.name}`,
      email: currentUser.email,
      role: 'telecaller',
      active: true
    };
    return (
      <TelecallerDashboard
        callerUser={simulatedProfile}
        onLogout={handleLogout}
        isAdminSimulation={true}
        onBackToAdmin={() => setSimulateTelecaller(false)}
      />
    );
  }

  // Logged in as Admin
  if (currentUser.role === 'admin') {
    return (
      <AdminDashboard
        adminUser={currentUser}
        onLogout={handleLogout}
        onSwitchToTelecallerSimulator={() => setSimulateTelecaller(true)}
      />
    );
  }

  // Logged in as Telecaller (Regular staff fallback)
  if (currentUser.role === 'telecaller') {
    if (!currentUser.active) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mb-6">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-200">Account Deactivated</h2>
          <p className="text-sm text-slate-400 max-w-sm mt-2">
            Your telecaller account status is currently set to inactive. Please contact the administrator to reactivate your workspace access.
          </p>
          <button
            onClick={handleLogout}
            className="mt-6 py-2 px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
          >
            Sign Out
          </button>
        </div>
      );
    }
    
    return (
      <TelecallerDashboard
        callerUser={currentUser}
        onLogout={handleLogout}
        isAdminSimulation={false}
      />
    );
  }

  // In case of unknown role
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-400">
      <p>Unknown User Role Access Denied.</p>
      <button onClick={handleLogout} className="mt-4 py-2 px-6 bg-slate-800 text-slate-200 rounded-lg">
        Log Out
      </button>
    </div>
  );
}
