/**
 * Row-level authorisation for audit records, applied on EVERY read path (REST list, stats,
 * verify, OData collection, entity, $count, Verify function) before anything is returned.
 *
 *  - no principal (auth explicitly off): everything, as before
 *  - a service identity: everything its scope allows (the guard already checked audit.read)
 *  - a user with the "auditor" role: everything
 *  - any other user: only records they own
 *
 * The owner travels inside the event envelope ("owner", set by the producing component from
 * the authenticated caller), so it is part of the hashed, anchored payload and cannot be
 * re-assigned without breaking verification. Records with no owner (security denials,
 * system events) are visible to auditors and services only.
 */
function ownerOf(record) {
  if (!record) return null;
  const o = record.owner ?? (record.event && record.event.owner);
  return o === undefined || o === null || o === "" ? null : String(o);
}

function canSee(principal, record) {
  if (!principal) return true;
  if (principal.kind === "service") return true;
  if ((principal.roles || []).includes("auditor")) return true;
  const owner = ownerOf(record);
  return owner !== null && owner === String(principal.subject);
}

const visible = (principal, records) => records.filter(r => canSee(principal, r));

module.exports = { canSee, ownerOf, visible };
