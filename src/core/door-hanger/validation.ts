// Pure validation for the Phase 5B-2 Door Hanger admin create actions.
// Mirrors the CHECK constraints in 20260525120000_phase_5_door_hanger.sql
// so user-facing errors arrive before any DB round-trip.

import {
  DOOR_HANGER_CAMPAIGN_STATUSES,
  DOOR_HANGER_ROUTE_STATUSES,
  type DoorHangerCampaignStatus,
  type DoorHangerRouteStatus,
} from "@/plugins/door-hanger";

const NAME_MAX = 200;
const NOTES_MAX = 2000;
const OFFER_MAX = 500;
const TARGET_AREA_MAX = 200;
const VERSION_MAX = 120;
const ADDRESS_MAX = 300;

type FieldError = { field: string; code: string; message: string };

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldError[] };

function fail<T>(errors: FieldError[]): ValidationResult<T> {
  return { ok: false, errors };
}

// -------------------------------------------------------------------------
// Campaign
// -------------------------------------------------------------------------
export type CampaignFormInput = {
  name: string;
  offerSummary?: string | null;
  targetArea?: string | null;
  status?: string | null;
  responseRateAssumption?: number | null;
  quoteToBookingAssumption?: number | null;
  averageJobValueCents?: number | null;
  notes?: string | null;
};

export type CampaignValidated = {
  name: string;
  offerSummary: string | null;
  targetArea: string | null;
  status: DoorHangerCampaignStatus;
  responseRateAssumption: number | null;
  quoteToBookingAssumption: number | null;
  averageJobValueCents: number | null;
  notes: string | null;
};

export function validateCampaign(
  input: CampaignFormInput,
): ValidationResult<CampaignValidated> {
  const errors: FieldError[] = [];

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    errors.push({ field: "name", code: "REQUIRED", message: "Campaign name is required." });
  } else if (name.length > NAME_MAX) {
    errors.push({ field: "name", code: "TOO_LONG", message: `Name must be ≤ ${NAME_MAX} characters.` });
  }

  const offerSummary = trimOrNull(input.offerSummary, OFFER_MAX, "offerSummary", errors);
  const targetArea = trimOrNull(input.targetArea, TARGET_AREA_MAX, "targetArea", errors);
  const notes = trimOrNull(input.notes, NOTES_MAX, "notes", errors);

  const rawStatus = (input.status ?? "draft").trim();
  const status: DoorHangerCampaignStatus =
    (DOOR_HANGER_CAMPAIGN_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as DoorHangerCampaignStatus)
      : "draft";
  if (rawStatus && !DOOR_HANGER_CAMPAIGN_STATUSES.includes(status)) {
    errors.push({ field: "status", code: "INVALID_STATUS", message: "Unknown campaign status." });
  }

  const responseRate = validateRate(input.responseRateAssumption, "responseRateAssumption", errors);
  const bookingRate = validateRate(input.quoteToBookingAssumption, "quoteToBookingAssumption", errors);
  const avgJobValue = validateNonNegInt(input.averageJobValueCents, "averageJobValueCents", errors);

  if (errors.length > 0) return fail(errors);
  return {
    ok: true,
    data: {
      name,
      offerSummary,
      targetArea,
      status,
      responseRateAssumption: responseRate,
      quoteToBookingAssumption: bookingRate,
      averageJobValueCents: avgJobValue,
      notes,
    },
  };
}

// -------------------------------------------------------------------------
// Inventory / design
// -------------------------------------------------------------------------
export type DesignFormInput = {
  name: string;
  versionOrOffer?: string | null;
  quantityReceived: number;
  totalPrintCostCents?: number | null;
  receivedAt?: string | null;
  notes?: string | null;
};

export type DesignValidated = {
  name: string;
  versionOrOffer: string | null;
  quantityReceived: number;
  totalPrintCostCents: number | null;
  receivedAt: string | null;
  notes: string | null;
};

export function validateDesign(
  input: DesignFormInput,
): ValidationResult<DesignValidated> {
  const errors: FieldError[] = [];
  const name = (input.name ?? "").trim();
  if (name.length === 0) errors.push({ field: "name", code: "REQUIRED", message: "Design name is required." });
  else if (name.length > NAME_MAX) errors.push({ field: "name", code: "TOO_LONG", message: `Name must be ≤ ${NAME_MAX} characters.` });

  const versionOrOffer = trimOrNull(input.versionOrOffer, VERSION_MAX, "versionOrOffer", errors);
  const notes = trimOrNull(input.notes, NOTES_MAX, "notes", errors);

  let quantityReceived = input.quantityReceived;
  if (!Number.isFinite(quantityReceived) || !Number.isInteger(quantityReceived) || quantityReceived <= 0) {
    errors.push({
      field: "quantityReceived",
      code: "INVALID_QUANTITY",
      message: "Quantity received must be a positive integer.",
    });
    quantityReceived = 0;
  }

  const totalPrintCostCents = validateNonNegInt(input.totalPrintCostCents, "totalPrintCostCents", errors);

  const receivedAt = (input.receivedAt ?? "").trim() || null;
  if (receivedAt && Number.isNaN(Date.parse(receivedAt))) {
    errors.push({ field: "receivedAt", code: "INVALID_DATE", message: "Received date is invalid." });
  }

  if (errors.length > 0) return fail(errors);
  return {
    ok: true,
    data: {
      name,
      versionOrOffer,
      quantityReceived,
      totalPrintCostCents,
      receivedAt,
      notes,
    },
  };
}

// -------------------------------------------------------------------------
// Route (manual shell)
// -------------------------------------------------------------------------
export type RouteFormInput = {
  campaignId?: string | null;
  name: string;
  centerAddress?: string | null;
  radiusMiles?: number | null;
  targetHomeCount?: number | null;
  estimatedTimeSeconds?: number | null;
  status?: string | null;
  notes?: string | null;
};

export type RouteValidated = {
  campaignId: string | null;
  name: string;
  centerAddress: string | null;
  radiusMiles: number | null;
  targetHomeCount: number | null;
  estimatedTimeSeconds: number | null;
  status: DoorHangerRouteStatus;
  notes: string | null;
};

export function validateRoute(
  input: RouteFormInput,
): ValidationResult<RouteValidated> {
  const errors: FieldError[] = [];
  const name = (input.name ?? "").trim();
  if (name.length === 0) errors.push({ field: "name", code: "REQUIRED", message: "Route name is required." });
  else if (name.length > NAME_MAX) errors.push({ field: "name", code: "TOO_LONG", message: `Name must be ≤ ${NAME_MAX} characters.` });

  const centerAddress = trimOrNull(input.centerAddress, ADDRESS_MAX, "centerAddress", errors);
  const notes = trimOrNull(input.notes, NOTES_MAX, "notes", errors);
  const campaignId = nullableId(input.campaignId);

  const radius = validatePositiveNumber(input.radiusMiles, "radiusMiles", errors);
  const target = validatePositiveInt(input.targetHomeCount, "targetHomeCount", errors);
  const estTime = validateNonNegInt(input.estimatedTimeSeconds, "estimatedTimeSeconds", errors);

  const rawStatus = (input.status ?? "draft").trim();
  const status: DoorHangerRouteStatus =
    (DOOR_HANGER_ROUTE_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as DoorHangerRouteStatus)
      : "draft";
  if (rawStatus && !DOOR_HANGER_ROUTE_STATUSES.includes(status)) {
    errors.push({ field: "status", code: "INVALID_STATUS", message: "Unknown route status." });
  }

  if (errors.length > 0) return fail(errors);
  return {
    ok: true,
    data: {
      campaignId,
      name,
      centerAddress,
      radiusMiles: radius,
      targetHomeCount: target,
      estimatedTimeSeconds: estTime,
      status,
      notes,
    },
  };
}

// -------------------------------------------------------------------------
// Distribution session
// -------------------------------------------------------------------------
export type SessionFormInput = {
  campaignId: string;
  routeId: string;
  designId: string;
  distributedAt: string;
  hangersDistributed: number;
  timeSpentSeconds?: number | null;
  notes?: string | null;
};

export type SessionValidated = {
  campaignId: string;
  routeId: string;
  designId: string;
  distributedAt: string;
  hangersDistributed: number;
  timeSpentSeconds: number | null;
  notes: string | null;
};

export function validateSession(
  input: SessionFormInput,
): ValidationResult<SessionValidated> {
  const errors: FieldError[] = [];
  const campaignId = (input.campaignId ?? "").trim();
  const routeId = (input.routeId ?? "").trim();
  const designId = (input.designId ?? "").trim();
  if (!campaignId) errors.push({ field: "campaignId", code: "REQUIRED", message: "Campaign is required." });
  if (!routeId) errors.push({ field: "routeId", code: "REQUIRED", message: "Route is required." });
  if (!designId) errors.push({ field: "designId", code: "REQUIRED", message: "Inventory / design is required." });

  const distributedAt = (input.distributedAt ?? "").trim();
  if (!distributedAt) {
    errors.push({ field: "distributedAt", code: "REQUIRED", message: "Distribution date is required." });
  } else if (Number.isNaN(Date.parse(distributedAt))) {
    errors.push({ field: "distributedAt", code: "INVALID_DATE", message: "Date is invalid." });
  }

  let hangers = input.hangersDistributed;
  if (!Number.isFinite(hangers) || !Number.isInteger(hangers) || hangers <= 0) {
    errors.push({
      field: "hangersDistributed",
      code: "INVALID_QUANTITY",
      message: "Hangers distributed must be a positive integer.",
    });
    hangers = 0;
  }

  const timeSpent = validateNonNegInt(input.timeSpentSeconds, "timeSpentSeconds", errors);
  const notes = trimOrNull(input.notes, NOTES_MAX, "notes", errors);

  if (errors.length > 0) return fail(errors);
  return {
    ok: true,
    data: {
      campaignId,
      routeId,
      designId,
      distributedAt,
      hangersDistributed: hangers,
      timeSpentSeconds: timeSpent,
      notes,
    },
  };
}

// -------------------------------------------------------------------------
// Shared helpers
// -------------------------------------------------------------------------
function trimOrNull(
  value: string | null | undefined,
  max: number,
  field: string,
  errors: FieldError[],
): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  if (s.length > max) {
    errors.push({ field, code: "TOO_LONG", message: `${field} must be ≤ ${max} characters.` });
  }
  return s;
}

function validateRate(
  value: number | null | undefined,
  field: string,
  errors: FieldError[],
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) {
    errors.push({ field, code: "NOT_A_NUMBER", message: `${field} must be a number between 0 and 1.` });
    return null;
  }
  if (value < 0 || value > 1) {
    errors.push({ field, code: "OUT_OF_RANGE", message: `${field} must be between 0 and 1.` });
    return null;
  }
  return value;
}

function validateNonNegInt(
  value: number | null | undefined,
  field: string,
  errors: FieldError[],
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) {
    errors.push({ field, code: "NOT_A_NUMBER", message: `${field} must be a number.` });
    return null;
  }
  if (value < 0) {
    errors.push({ field, code: "NEGATIVE", message: `${field} must be ≥ 0.` });
    return null;
  }
  if (!Number.isInteger(value)) {
    errors.push({ field, code: "NOT_AN_INTEGER", message: `${field} must be an integer.` });
    return null;
  }
  return value;
}

function validatePositiveInt(
  value: number | null | undefined,
  field: string,
  errors: FieldError[],
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    errors.push({ field, code: "INVALID_POSITIVE_INT", message: `${field} must be a positive integer.` });
    return null;
  }
  return value;
}

function validatePositiveNumber(
  value: number | null | undefined,
  field: string,
  errors: FieldError[],
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) {
    errors.push({ field, code: "INVALID_POSITIVE", message: `${field} must be > 0.` });
    return null;
  }
  return value;
}

function nullableId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Inventory-availability check used by the session create helper. Pure
// so the tests pin the rule without DB.
export function hasEnoughInventory(input: {
  quantityReceived: number;
  quantityUsed: number;
  hangersDistributed: number;
}): boolean {
  return input.quantityReceived - input.quantityUsed >= input.hangersDistributed;
}
