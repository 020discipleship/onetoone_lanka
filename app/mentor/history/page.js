import { MentorMenteeListScreen, ScreenPage } from "../../page";

export default function MentorHistoryPage() {
  return (
    <ScreenPage title="Mentee Discipleship History" note="Previous discipleship records by mentee">
      <MentorMenteeListScreen history />
    </ScreenPage>
  );
}
