import { AdminMembers, ScreenPage } from "../../page";

export default function AdminMembersPage() {
  return (
    <ScreenPage title="Member Management" note="Approve users and manage roles">
      <AdminMembers />
    </ScreenPage>
  );
}
