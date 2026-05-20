import { MentorMenteeListScreen, ScreenPage } from "../../page";

export default function MentorMenteesPage() {
  return (
    <ScreenPage title="Assigned Mentee List" note="Mentees assigned to the current mentor">
      <MentorMenteeListScreen />
    </ScreenPage>
  );
}
