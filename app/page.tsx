import AuthGate from "./AuthGate";
import Dashboard from "./dashboard/Dashboard";

export default function Home() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
