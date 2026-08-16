import {
  FLOOR_ROLES,
  type StaffRecord,
  type StaffRole,
} from "@/lib/types"

export function hasRole(roles: readonly StaffRole[], role: StaffRole): boolean {
  return roles.includes(role)
}

export function isOwner(roles: readonly StaffRole[]): boolean {
  return hasRole(roles, "owner")
}

export function canManage(roles: readonly StaffRole[]): boolean {
  return isOwner(roles) || hasRole(roles, "manager")
}

export function canGrantLeadership(roles: readonly StaffRole[]): boolean {
  return isOwner(roles)
}

export function canEditSlots(roles: readonly StaffRole[]): boolean {
  return canManage(roles)
}

export function canCorrectAttendance(roles: readonly StaffRole[]): boolean {
  return canManage(roles)
}

export function canAcceptSuggestions(roles: readonly StaffRole[]): boolean {
  return canManage(roles)
}

export function canSubmitOwnPrefs(_roles: readonly StaffRole[]): boolean {
  return true
}

export function floorRolesOf(roles: readonly StaffRole[]): StaffRole[] {
  return roles.filter((role) =>
    (FLOOR_ROLES as readonly StaffRole[]).includes(role)
  )
}

export function activeOwners(staff: readonly StaffRecord[]): StaffRecord[] {
  return staff.filter((member) => member.isActive && isOwner(member.roles))
}

export function assertLastOwnerSafe(
  staff: readonly StaffRecord[],
  targetId: string,
  nextRoles: readonly StaffRole[],
  nextActive = true
): void {
  const remaining = staff.filter((member) => {
    if (member.id === targetId) {
      return nextActive && isOwner(nextRoles)
    }
    return member.isActive && isOwner(member.roles)
  })
  if (remaining.length === 0) {
    throw new Error("Owner terakhir tidak boleh dicabut atau dinonaktifkan.")
  }
}

export function assertCanChangeRoles(
  actorRoles: readonly StaffRole[],
  target: StaffRecord,
  nextRoles: readonly StaffRole[],
  staff: readonly StaffRecord[],
  nextActive = target.isActive
): void {
  const leadershipTouched =
    isOwner(target.roles) !== isOwner(nextRoles) ||
    hasRole(target.roles, "manager") !== hasRole(nextRoles, "manager") ||
    isOwner(target.roles)

  if (leadershipTouched && !canGrantLeadership(actorRoles)) {
    throw new Error("Hanya owner yang boleh mengubah role owner atau manager.")
  }

  if (!canManage(actorRoles)) {
    throw new Error("Lantai tidak boleh mengubah data staff.")
  }

  assertLastOwnerSafe(staff, target.id, nextRoles, nextActive)
}
