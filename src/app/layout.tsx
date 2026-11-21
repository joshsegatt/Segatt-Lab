import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/features/navigation/components/Sidebar";
import { TopBar } from "@/features/navigation/components/TopBar";
import { LanguageProvider } from "@/hooks/useLanguage";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Tune, clean and repair Windows. Every change shows its real result and can be undone.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <LanguageProvider>
          <div className="app-shell">
            <Sidebar />
            <main className="app-main">
              <TopBar />
              <div className="app-content">{children}</div>
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
