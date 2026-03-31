import AuthGate from "../AuthGate";
import Dashboard from "./Dashboard";

export default function DashboardPage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

