import { redirect } from "next/navigation";

/** The root URL has no content of its own; the dashboard is the home screen. */
export default function Home() {
  redirect("/dashboard");
}
