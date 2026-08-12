/**
 * Writes an immutable audit record. Always call this with the same
 * `client` (pg PoolClient) that performed the mutating query, inside the
 * same transaction, so a rollback also rolls back the audit entry -
 * but nothing in the app ever UPDATEs or DELETEs from audit_logs itself.
 */
async function writeAudit(client, {
  action,        // 'CREATE' | 'UPDATE' | 'DELETE'
  entity,        // table name, e.g. 'daily_task_logs'
  entityId,
  divisionId,
  actorId,
  oldValues = null,
  newValues = null,
  note = null,
  flagged = false,
}) {
  await client.query(
    `INSERT INTO audit_logs
      (action, entity, entity_id, division_id, actor_id, old_values, new_values, note, flagged)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [action, entity, entityId, divisionId, actorId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      note, flagged]
  );
}

module.exports = { writeAudit };
