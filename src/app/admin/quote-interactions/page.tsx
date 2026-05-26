import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  DetailGrid,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
  type StatusTone,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  interaction_status: string;
  service_area_status: string;
  property_data_status: string;
  normalized_city: string | null;
  google_place_id: string | null;
  selected_option_key: string | null;
  selected_total: number | null;
  converted_contact_id: string | null;
  converted_property_id: string | null;
  converted_lead_id: string | null;
  converted_quote_id: string | null;
  converted_at: string | null;
  quote_preview_data: {
    price_snapshot?: {
      options?: Record<string, number>;
      add_ons?: Record<string, number>;
    };
  } | null;
  normalized_address: {
    formatted_address?: string;
  } | null;
  address_input: string | null;
};

export default async function QuoteInteractionsPage() {
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

  const { data, error } = await supabase
    .from("quote_page_interactions")
    .select(
      "id, created_at, interaction_status, service_area_status, property_data_status, normalized_city, google_place_id, selected_option_key, selected_total, converted_contact_id, converted_property_id, converted_lead_id, converted_quote_id, converted_at, quote_preview_data, normalized_address, address_input",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as Row[];

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
        eyebrow="Observability"
        title="Quote interactions"
        description={`Source / audit / debug view of public /q submissions. One row per address lookup — out-of-area, missing-data, and converted attempts all land here. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load interactions: {error.message}
          </p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No interactions yet"
          description="Open /q and pick an address to create the first one."
        />
      ) : (
        <SectionCard padding="none">
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="p-4">
                <InteractionRow row={row} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </AdminShell>
  );
}

function interactionTone(status: string): StatusTone {
  switch (status) {
    case "quote_generated":
      return "success";
    case "out_of_area":
    case "property_data_missing":
      return "warning";
    case "contact_submitted":
    case "converted":
      return "info";
    case "error":
      return "danger";
    default:
      return "default";
  }
}

function InteractionRow({ row }: { row: Row }) {
  const address =
    row.normalized_address?.formatted_address ?? row.address_input ?? "—";
  const previewOptions = row.quote_preview_data?.price_snapshot?.options;
  const previewInterior =
    row.quote_preview_data?.price_snapshot?.add_ons?.interior_window_cleaning;

  const converted = Boolean(
    row.converted_contact_id ||
      row.converted_lead_id ||
      row.converted_quote_id,
  );

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-all font-medium text-ink">{address}</div>
          <div className="mt-0.5 font-mono text-xs text-ink-faint">
            {row.normalized_city ?? "—"}
            {row.google_place_id ? ` · ${row.google_place_id}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap text-xs">
          <StatusBadge tone={interactionTone(row.interaction_status)}>
            {row.interaction_status.replace(/_/g, " ")}
          </StatusBadge>
          <span className="text-ink-faint">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <DetailGrid
          columns={4}
          items={[
            { label: "Service area", value: row.service_area_status },
            { label: "Property data", value: row.property_data_status },
            {
              label: "Selected option",
              value: row.selected_option_key ?? "—",
              tone: row.selected_option_key ? "default" : "muted",
            },
            {
              label: "Selected total",
              value:
                row.selected_total !== null ? `$${row.selected_total}` : "—",
              tone: row.selected_total !== null ? "default" : "muted",
            },
            {
              label: "Converted",
              value: converted ? "yes" : "no",
              tone: converted ? "default" : "muted",
            },
            ...(row.converted_at
              ? [
                  {
                    label: "Converted at",
                    value: new Date(row.converted_at).toLocaleString(),
                  },
                ]
              : []),
            ...(previewOptions
              ? [
                  {
                    label: "Preview prices",
                    value: `one $${previewOptions.one_time ?? "—"} · 6mo $${previewOptions.six_month ?? "—"} · 3mo $${previewOptions.three_month ?? "—"}${
                      previewInterior !== undefined
                        ? ` · int +$${previewInterior}`
                        : ""
                    }`,
                  },
                ]
              : []),
          ]}
        />
      </div>

      {converted && (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] sm:grid-cols-2">
          {row.converted_contact_id && (
            <IdLink
              label="contact"
              id={row.converted_contact_id}
              href={`/admin/contacts/${row.converted_contact_id}`}
            />
          )}
          {row.converted_property_id && (
            <IdLink label="property" id={row.converted_property_id} />
          )}
          {row.converted_lead_id && (
            <IdLink
              label="lead"
              id={row.converted_lead_id}
              href={`/admin/leads/${row.converted_lead_id}`}
            />
          )}
          {row.converted_quote_id && (
            <IdLink
              label="quote"
              id={row.converted_quote_id}
              href={`/admin/quotes/${row.converted_quote_id}`}
            />
          )}
        </dl>
      )}
    </div>
  );
}

function IdLink({
  label,
  id,
  href,
}: {
  label: string;
  id: string;
  href?: string;
}) {
  const short = `${id.slice(0, 8)}…`;
  return (
    <div className="flex items-center gap-2">
      <dt className="uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="font-mono text-ink">
        {href ? (
          <Link href={href} className="underline" title={id}>
            {short}
          </Link>
        ) : (
          <span title={id}>{short}</span>
        )}
      </dd>
    </div>
  );
}
