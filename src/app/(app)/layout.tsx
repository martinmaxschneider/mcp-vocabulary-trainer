import { Nav } from "~/components/nav";
import { GamificationProvider } from "~/components/gamification-provider";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <GamificationProvider>
        <Nav />
        <div className="cahier-sheet">
          <main className="cahier-inner">{children}</main>
        </div>
      </GamificationProvider>
    </div>
  );
}
