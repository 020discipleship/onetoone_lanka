import { AdminDashboard, ScreenPage } from "../page";

export default function AdminPage() {
  return (
    <ScreenPage title="Admin Dashboard" note="Member approval, roles, and progress">
      <AdminDashboard />
    </ScreenPage>
  );
}
