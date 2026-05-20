import { FindPasswordScreen, ScreenPage } from "../page";

export default function FindPasswordPage() {
  return (
    <ScreenPage title="Find Password" note="Send a password reset link">
      <FindPasswordScreen />
    </ScreenPage>
  );
}
