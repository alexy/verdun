import type { VerdunAccountSql } from './store.js'

export type VerdunWorkspaceRole = string
export type VerdunWorkspaceAccess = { workspaceId: string, ownerAccountId: string, role: VerdunWorkspaceRole | 'owner' }
export type VerdunWorkspaceMember = { accountId: string, email: string, name: string | null, role: string, joinedAt: string }
export type VerdunWorkspaceInvitation = { id: string, email: string, role: string, expiresAt: string, createdAt: string }

export async function resolveVerdunWorkspace(sql: VerdunAccountSql, applicationKey: string, accountId: string): Promise<VerdunWorkspaceAccess> {
  await acceptVerdunWorkspaceInvitations(sql, applicationKey, accountId)
  const rows = await sql.query(`select w.id, w.owner_account_id, m.role from verdun_workspace_member m join verdun_workspace w on w.id = m.workspace_id where w.application_key = $1 and m.account_id = $2 order by m.updated_at desc limit 1`, [applicationKey, accountId]) as Array<{ id: string, owner_account_id: string, role: string }>
  if (rows[0]) return { workspaceId: rows[0].id, ownerAccountId: rows[0].owner_account_id, role: rows[0].role }
  const owners = await sql.query(`insert into verdun_workspace (application_key, owner_account_id) values ($1, $2) on conflict (application_key, owner_account_id) do update set updated_at = verdun_workspace.updated_at returning id, owner_account_id`, [applicationKey, accountId]) as Array<{ id: string, owner_account_id: string }>
  if (!owners[0]) throw new Error('verdun_workspace_unavailable')
  return { workspaceId: owners[0].id, ownerAccountId: owners[0].owner_account_id, role: 'owner' }
}

export async function acceptVerdunWorkspaceInvitations(sql: VerdunAccountSql, applicationKey: string, accountId: string): Promise<void> {
  const rows = await sql.query(`select i.id, i.workspace_id, i.role from verdun_workspace_invitation i join verdun_workspace w on w.id = i.workspace_id join verdun_account a on a.email = i.email where w.application_key = $1 and a.id = $2 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`, [applicationKey, accountId]) as Array<{ id: string, workspace_id: string, role: string }>
  for (const invite of rows) {
    await sql.query(`insert into verdun_workspace_member (workspace_id, account_id, role) values ($1, $2, $3) on conflict (workspace_id, account_id) do update set role = excluded.role, updated_at = now()`, [invite.workspace_id, accountId, invite.role])
    await sql.query(`update verdun_workspace_invitation set accepted_at = now() where id = $1`, [invite.id])
  }
}

export async function listVerdunWorkspace(sql: VerdunAccountSql, workspaceId: string): Promise<{ members: VerdunWorkspaceMember[], invitations: VerdunWorkspaceInvitation[] }> {
  const members = await sql.query(`select m.account_id, a.email, a.name, m.role, m.created_at from verdun_workspace_member m join verdun_account a on a.id=m.account_id where m.workspace_id=$1 order by m.created_at`, [workspaceId]) as Array<{ account_id: string, email: string, name: string | null, role: string, created_at: string }>
  const invitations = await sql.query(`select id, email, role, expires_at, created_at from verdun_workspace_invitation where workspace_id=$1 and accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`, [workspaceId]) as Array<{ id: string, email: string, role: string, expires_at: string, created_at: string }>
  return { members: members.map((m) => ({ accountId: m.account_id, email: m.email, name: m.name, role: m.role, joinedAt: String(m.created_at) })), invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: String(i.expires_at), createdAt: String(i.created_at) })) }
}

export async function inviteVerdunWorkspaceMember(sql: VerdunAccountSql, workspaceId: string, actorAccountId: string, email: string, role: string): Promise<VerdunWorkspaceInvitation> {
  const rows = await sql.query(`insert into verdun_workspace_invitation (workspace_id, email, role, created_by_account_id) values ($1,$2,$3,$4) on conflict (workspace_id,email) do update set role=excluded.role, created_by_account_id=excluded.created_by_account_id, expires_at=now()+interval '7 days', accepted_at=null, revoked_at=null returning id,email,role,expires_at,created_at`, [workspaceId, email, role, actorAccountId]) as Array<{ id: string, email: string, role: string, expires_at: string, created_at: string }>
  const row = rows[0]; if (!row) throw new Error('verdun_workspace_invitation_failed')
  return { id: row.id, email: row.email, role: row.role, expiresAt: String(row.expires_at), createdAt: String(row.created_at) }
}

export async function updateVerdunWorkspaceMemberRole(sql: VerdunAccountSql, workspaceId: string, accountId: string, role: string): Promise<boolean> {
  const rows = await sql.query(`update verdun_workspace_member set role=$3, updated_at=now() where workspace_id=$1 and account_id=$2 returning account_id`, [workspaceId, accountId, role]) as Array<{ account_id: string }>; return Boolean(rows[0])
}
export async function removeVerdunWorkspaceMember(sql: VerdunAccountSql, workspaceId: string, accountId: string): Promise<boolean> {
  const rows = await sql.query(`delete from verdun_workspace_member where workspace_id=$1 and account_id=$2 returning account_id`, [workspaceId, accountId]) as Array<{ account_id: string }>; return Boolean(rows[0])
}
