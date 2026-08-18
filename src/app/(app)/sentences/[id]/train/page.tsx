"use client";

import { use } from "react";
import { SatzTrain } from "~/components/satz-train";

export default function SentenceTrainPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SatzTrain id={id} />;
}
