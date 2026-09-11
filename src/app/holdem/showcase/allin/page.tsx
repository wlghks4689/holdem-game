import { notFound } from "next/navigation";
import { AllInShowcaseClient } from "./AllInShowcaseClient";

export default async function AllInShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ viewer?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { viewer } = await searchParams;

  return <AllInShowcaseClient initialViewer={viewer === "1" ? 1 : 0} />;
}
