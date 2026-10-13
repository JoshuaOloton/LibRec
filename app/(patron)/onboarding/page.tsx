import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingForm } from "@/components/onboarding-form";
import { getOnboardingChoices, loadHistory } from "@/server/services/recommendations";

export const metadata: Metadata = { title: "Start your shelf" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fonboarding");
  // Anyone with a history already has a shelf to look at.
  if ((await loadHistory(Number(session.user.id))).length > 0) redirect("/recommendations");

  const { genres, popular } = await getOnboardingChoices();
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">Start your shelf</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Tell LibRec what you like and it will suggest books straight away, with a reason for each.
        </p>
      </div>
      <OnboardingForm genres={genres} popular={popular} />
    </div>
  );
}
