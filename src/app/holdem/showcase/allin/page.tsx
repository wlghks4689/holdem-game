import { notFound } from "next/navigation";
import { AllInShowcaseClient } from "./AllInShowcaseClient";

export default function AllInShowcasePage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <AllInShowcaseClient />;
}
