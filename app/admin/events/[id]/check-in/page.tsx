import { redirect } from "next/navigation";

// The scanner lives at /check-in/[id] so volunteers (who have no admin
// access) can use it too. This keeps the address under /admin working.
export default async function AdminCheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/check-in/${id}`);
}
