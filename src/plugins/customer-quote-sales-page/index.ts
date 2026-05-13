// Public surface for the Customer Quote / Sales Page Plugin.
//
// ⚠️ SERVER-SIDE ONLY barrel. This file re-exports `address-lookup`,
// `interactions`, and `context`, each of which `import "server-only"`.
// Client Components must NOT import from this barrel — even mixed
// `type`-modifier imports will trigger Next.js' "server-only" build
// guard because the value-side specifiers keep the import declaration
// alive. Client code should import the pure pieces directly:
//   import { computeSelectedTotal, ... } from "@/plugins/customer-quote-sales-page/selection";
//   import type { AddressLookupResult, ... } from "@/plugins/customer-quote-sales-page/types";

export { CUSTOMER_QUOTE_SALES_PAGE } from "./manifest";
export { lookupAddressAndPreview } from "./address-lookup";
export { recordQuotePageInteraction } from "./interactions";
export { loadCustomerQuotePageContext } from "./context";
export { decideOutcome } from "./outcome";
export { submitContactAndConvert } from "./submit-contact";
export {
  computeSelectedTotal,
  canSchedule,
  findSelectedOption,
  INITIAL_SELECTION,
} from "./selection";

export type {
  AddressLookupData,
  AddressLookupError,
  AddressLookupErrorCode,
  AddressLookupKind,
  AddressLookupResult,
  CustomerQuotePageContext,
  InteractionStatus,
  OutOfAreaResult,
  PropertyDataMissingResult,
  PropertyDataStatus,
  QuoteGeneratedResult,
  ServiceAreaStatus,
  TrackingContext,
} from "./types";

export type { SelectionState } from "./selection";

export type {
  SubmitContactInput,
  SubmitContactResult,
  SubmitContactSuccess,
  SubmitContactError,
} from "./submit-contact";

export type {
  ContactFormInput,
  SelectionInput,
  SubmitKind,
  LeadStatus,
  TaskCategory,
} from "./submit-mapping";
