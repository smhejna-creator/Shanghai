import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/supabase/useAuth';
import { AuthScreen } from './screens/AuthScreen';
import { HomeScreen } from './screens/HomeScreen';
import { JoinScreen } from './screens/JoinScreen';
import { GameScreen } from './screens/GameScreen';
import { RuleSetsScreen, SetupScreen } from './screens/SetupScreen';

export default function App() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center text-white/70">Loading…</div>;
  if (!user) return <AuthScreen />;
  return (
    <Routes>
      <Route path="/" element={<HomeScreen user={user} signOut={signOut} />} />
      <Route path="/new" element={<Navigate to="/new/shanghai" replace />} />
      <Route path="/new/:game" element={<SetupScreen user={user} />} />
      <Route path="/rulesets" element={<RuleSetsScreen user={user} />} />
      <Route path="/join/:code" element={<JoinScreen user={user} />} />
      <Route path="/g/:id" element={<GameScreen user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
