import { MentorDashboard, ScreenPage } from "../../page";

export default function MentorDashboardPage() {
  return (
    <ScreenPage title="My Dashboard" note="Assigned mentees and review status">
      <MentorDashboard />
    </ScreenPage>
  );
}
