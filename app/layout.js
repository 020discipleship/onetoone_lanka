import "./globals.css";

export const metadata = {
  title: "One to One Discipleship",
  description: "Mobile web MVP for one-to-one discipleship program management"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
