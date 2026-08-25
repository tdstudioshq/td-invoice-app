import { redirect } from "next/navigation";

// /account used to be the customer's home: a profile form plus shortcut links.
// A signed-up customer is now a portal APPLICANT with exactly one state to be
// in, so this route only forwards to it. Approved customers never reach here at
// all — `requireCustomer()` in the group layout sends portal users to /portal
// before this runs. Kept as a redirect rather than deleted so older links,
// bookmarks and emailed paths don't 404.
export default function AccountPage() {
  redirect("/account/pending");
}
