import type { Metadata } from "next";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@fontsource/sarabun/800.css";
import ThemeRegistry from "./ThemeRegistry";
import { ToastrProvider } from "./components/Toastr";

export const metadata: Metadata = {
  title: "แดชบอร์ด MetaBot",
  description: "บอทวิเคราะห์และเทรดอัตโนมัติบน MT5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <ThemeRegistry>
          <ToastrProvider>{children}</ToastrProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
