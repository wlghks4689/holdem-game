import { notFound } from "next/navigation";
import { FxPreviewClient } from "./FxPreviewClient";

export default function FxPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <FxPreviewClient />;
}
