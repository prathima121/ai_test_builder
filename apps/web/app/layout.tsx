import "./globals.css";
import type { Metadata } from "next";
import ThemeToggle from "./components/theme-toggle";

export const metadata: Metadata = {
  title: "AI Test Builder",
  description: "Generate tests from syllabus and complexity"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{const t=localStorage.getItem('aitb-theme');if(t){document.documentElement.setAttribute('data-theme',t);} }catch(e){}"
          }}
        />
        <div className="min-h-screen p-6 md:p-10">
          <div className="mx-auto mb-6 flex max-w-6xl justify-end">
            <ThemeToggle />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
