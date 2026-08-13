import { Caveat, Libre_Baskerville } from "next/font/google";
import { WorksheetPlayer } from "~/components/worksheets/worksheet-player";

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export default async function WorksheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <WorksheetPlayer
      id={id}
      cursiveClassName={caveat.className}
      serifClassName={libreBaskerville.className}
    />
  );
}
