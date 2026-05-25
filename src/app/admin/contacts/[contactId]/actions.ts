"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { createActivity } from "@/core/activity/logger";
import { createNote } from "@/core/notes/create";
import { updateContact } from "@/core/contacts/update";

// =========================================================================
// Phase 4C contact detail server actions.
//
// Allowed writes:
//   - contacts: update full_name / phone / email
//   - notes: insert (related_object_type='contact')
//   - activities: insert (contact.updated, note.added)
// =========================================================================

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

async function requireBusiness(): Promise<
  { ok: true; userId: string; businessId: string } | Result<never>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Sign-in required." } };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business." },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

// -------------------------------------------------------------------------
// Update the editable customer-info fields on a contact.
// -------------------------------------------------------------------------
export async function updateContactAction(input: {
  contactId: string;
  fullName: string;
  phone: string;
  email: string;
}): Promise<
  Result<{
    contactId: string;
    changedFields: string[];
  }>
> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.contactId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contactId is required." },
    };
  }

  const update = await updateContact({
    businessId: auth.businessId,
    contactId: input.contactId,
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
  });
  if (!update.ok) {
    return { ok: false, error: update.error };
  }

  // Activity: only when something actually changed.
  if (update.diff.length > 0) {
    const changed = update.diff.map((d) => labelFor(d.field));
    await createActivity({
      businessId: auth.businessId,
      actorType: "user",
      actorUserId: auth.userId,
      activityType: "contact.updated",
      summary: `Contact updated: ${changed.join(", ")}.`,
      relatedObjectType: "contact",
      relatedObjectId: input.contactId,
    });
  }

  revalidatePath(`/admin/contacts/${input.contactId}`);
  revalidatePath("/admin/contacts");
  return {
    ok: true,
    data: {
      contactId: update.contactId,
      changedFields: update.diff.map((d) => d.field),
    },
  };
}

// -------------------------------------------------------------------------
// Add an internal note attached to the contact.
// -------------------------------------------------------------------------
export async function addContactNoteAction(input: {
  contactId: string;
  body: string;
}): Promise<Result<{ noteId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.contactId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contactId is required." },
    };
  }

  const noteResult = await createNote({
    businessId: auth.businessId,
    authorUserId: auth.userId,
    body: input.body,
    relatedObjectType: "contact",
    relatedObjectId: input.contactId,
  });
  if (!noteResult.ok) {
    return {
      ok: false,
      error: {
        code: noteResult.error.code,
        message: noteResult.error.message,
        ...(noteResult.error.code === "REQUIRED" || noteResult.error.code === "TOO_LONG"
          ? { fieldErrors: { body: noteResult.error.message } }
          : {}),
      },
    };
  }

  await createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "note.added",
    summary: `Contact note added: ${noteResult.body}`,
    relatedObjectType: "contact",
    relatedObjectId: input.contactId,
  });

  revalidatePath(`/admin/contacts/${input.contactId}`);
  return { ok: true, data: { noteId: noteResult.noteId } };
}

function labelFor(field: "fullName" | "phone" | "email"): string {
  switch (field) {
    case "fullName":
      return "name";
    case "phone":
      return "phone";
    case "email":
      return "email";
  }
}
