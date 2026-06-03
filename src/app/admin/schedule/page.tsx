import { redirect } from "next/navigation";

import {
  AdminShell,
  PageHeader,
  SectionCard,
  renderSimulationBanner,
  renderWorkspaceSwitcher,
  resolveAdminShellContext,
} from "@/components/admin";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  listScheduledJobsForWeek,
  listUnscheduledJobs,
} from "@/core/jobs/admin-data";
import {
  formatWeekKey,
  getWeekRange,
  parseWeekKey,
} from "@/core/jobs/scheduling";

import { SignOutButton } from "../sign-out-button";
import {
  classifyScheduledJobs,
  OutsideHoursList,
  ScheduleWeekGrid,
  UnscheduledJobsPanel,
} from "./schedule-views";
import { WeekNav } from "./week-nav";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ week?: string }>;
};

export default async function SchedulePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = await resolveAdminShellContext({
    business,
    userId: user.id,
    userEmail: user.email ?? "—",
  });

  // Effective "today": simulation workspace + active save uses
  // simulated_current_at; otherwise real now. Per Phase 10 doc §14 +
  // §3 of the Phase 10C brief.
  const simulatedNowIso =
    shell.simulationBanner?.activeRun?.simulatedCurrentAt ?? null;
  const today = simulatedNowIso ? new Date(simulatedNowIso) : new Date();
  const todayWeekRange = getWeekRange(today);

  // Visible week: ?week=YYYY-MM-DD or today's week as fallback.
  const params = (await searchParams) ?? {};
  const weekFromQuery = parseWeekKey(params.week);
  const visibleWeekRange = getWeekRange(weekFromQuery ?? today);

  const [scheduledJobs, unscheduledJobs] = await Promise.all([
    listScheduledJobsForWeek({
      businessId: business.id,
      weekStart: visibleWeekRange.start,
      weekEnd: visibleWeekRange.end,
    }),
    listUnscheduledJobs({ businessId: business.id }),
  ]);

  const classified = classifyScheduledJobs(scheduledJobs);

  const isSimulationWithoutActiveSave =
    business.isSimulation && shell.simulationBanner?.activeRun == null;

  const todayLabel = today.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  // Schedule-modal default date: today when the visible week is
  // today's week, otherwise Monday of the visible week.
  // `formatWeekKey` is a local-YYYY-MM-DD formatter; it works on
  // any Date, not just Mondays.
  const fallbackScheduleDate =
    visibleWeekRange.weekKey === todayWeekRange.weekKey
      ? formatWeekKey(today)
      : visibleWeekRange.weekKey;

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <PageHeader
        eyebrow="Operations"
        title="Schedule"
        description="Place jobs onto a weekly calendar. Click Schedule on an unscheduled job, or Reschedule / Unschedule on a scheduled card."
      />

      {isSimulationWithoutActiveSave && (
        <div className="mb-4 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
          No active simulation save — schedule uses real time.
        </div>
      )}

      <div className="mb-4">
        <WeekNav
          visibleWeekStart={visibleWeekRange.start}
          todayWeekStart={todayWeekRange.start}
          todayLabel={todayLabel}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Calendar column */}
        <div className="space-y-4">
          <SectionCard padding="none">
            {scheduledJobs.length === 0 ? (
              <div className="p-5 text-sm text-ink-muted">
                No scheduled jobs in this week.
              </div>
            ) : classified.visibleJobs.length === 0 ? (
              <div className="space-y-4 p-5">
                <p className="text-sm text-ink-muted">
                  No jobs land inside the visible 8 AM–6 PM Mon–Fri band
                  this week. See the outside-hours / weekend list below.
                </p>
                <ScheduleWeekGrid
                  jobs={classified.visibleJobs}
                  weekRange={visibleWeekRange}
                  fallbackDate={fallbackScheduleDate}
                />
              </div>
            ) : (
              <ScheduleWeekGrid
                jobs={classified.visibleJobs}
                weekRange={visibleWeekRange}
                fallbackDate={fallbackScheduleDate}
              />
            )}
          </SectionCard>

          {(classified.outsideHoursJobs.length > 0 ||
            classified.weekendJobs.length > 0) && (
            <SectionCard>
              <div className="space-y-4">
                {classified.outsideHoursJobs.length > 0 && (
                  <OutsideHoursList
                    title={`Outside 8 AM–6 PM · ${classified.outsideHoursJobs.length}`}
                    jobs={classified.outsideHoursJobs}
                    fallbackDate={fallbackScheduleDate}
                  />
                )}
                {classified.weekendJobs.length > 0 && (
                  <OutsideHoursList
                    title={`Weekend · ${classified.weekendJobs.length}`}
                    jobs={classified.weekendJobs}
                    fallbackDate={fallbackScheduleDate}
                  />
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Unscheduled panel column */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Unscheduled</h2>
            <span className="text-[11px] text-ink-faint">
              {unscheduledJobs.length} job
              {unscheduledJobs.length === 1 ? "" : "s"}
            </span>
          </div>
          <UnscheduledJobsPanel
            jobs={unscheduledJobs}
            fallbackDate={fallbackScheduleDate}
          />
        </div>
      </div>

    </AdminShell>
  );
}
