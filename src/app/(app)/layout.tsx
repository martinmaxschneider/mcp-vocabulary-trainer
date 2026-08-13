import { Nav } from "~/components/nav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="cahier-sheet">
        <main className="cahier-inner">{children}</main>
      </div>
    </div>
  );
}
