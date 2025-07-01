import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getData(): { message: string } {
    return { message: 'Hello API' };
  }

  async can(userId: string, permissionKey: string): Promise<boolean> {
    const [result] = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1
        FROM "User" u
        JOIN "Organization" o ON o.id = u."organizationId"
        LEFT JOIN "Group" g ON g.id = u."groupId"
        LEFT JOIN "_GroupToPermission" gp ON gp."A" = g.id
        LEFT JOIN "Permission" p_gp ON p_gp.id = gp."B"
        LEFT JOIN "FlattenedRolePermission" frp ON frp."roleId" = u."roleId"
        LEFT JOIN "Permission" p_rp ON p_rp.id = frp."permissionId"
        -- LEFT JOIN "_PermissionToRole" pr ON pr."B" = u."roleId"
        -- LEFT JOIN "Permission" p_rp ON p_rp.id = pr."A"
        WHERE u.id = $1::uuid
          AND (
            -- is org admin
            o."adminId" = u.id

            -- is group admin
            -- OR (g."adminId" = u.id AND EXISTS (
            --  SELECT 1 FROM "_GroupPermissions" gpg
            --  JOIN "Permission" pgp ON pgp.id = gpg."B"
            --  WHERE gpg."A" = g.id AND pgp.key = $2
            -- ))

            -- has group/role permission
            OR p_gp.key = $2
            OR p_rp.key = $2
          )
      )
    `, userId, permissionKey);

    return result?.exists ?? false;
  }

  async canWithRecursion__DEPRECATED(
    userId: string,
    permissionKey: string
  ): Promise<boolean> {
    const [result] = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
      WITH RECURSIVE role_hierarchy AS (
        -- Base case: direct role
        SELECT r1.id, r1."parentRoleId"
        FROM "Role" r1
        WHERE r1.id = (SELECT "roleId" FROM "User" WHERE id = $1::uuid)

        UNION ALL

        -- Recursive case: parent roles
        SELECT r2.id, r2."parentRoleId"
        FROM "Role" r2
          INNER JOIN role_hierarchy rh ON rh."parentRoleId" = r2.id
      )
      SELECT EXISTS (
        SELECT 1
        FROM "User" u
          JOIN "Organization" o ON o.id = u."organizationId"
          LEFT JOIN "Group" g ON g.id = u."groupId"
          LEFT JOIN "_GroupToPermission" gp ON gp."A" = g.id
          LEFT JOIN "Permission" p_gp ON p_gp.id = gp."B"
          LEFT JOIN "_PermissionToRole" pr ON pr."B" IN (SELECT rh.id FROM role_hierarchy rh)
          LEFT JOIN "Permission" p_rp ON p_rp.id = pr."A"
        WHERE u.id = $1::uuid
          AND (
            -- is org admin
            o."adminId" = u.id

            -- has group/role permission (including inherited)
            OR p_gp.key = $2
            OR p_rp.key = $2
          )
      )
    `, userId, permissionKey);

    return result?.exists ?? false;
  }

  async flattenRoleHierarchy(organizationId: string): Promise<void> {
    // Clear existing flattened permissions
    await this.prisma.flattenedRolePermission.deleteMany({ where: { organizationId } });

    await this.prisma.$executeRawUnsafe(`
      WITH RECURSIVE role_hierarchy AS (
        -- Base case: every role is an ancestor of itself
        SELECT id AS role_id, id AS ancestor_role_id
             ,name
        FROM "Role"
        WHERE "organizationId" = $1::uuid

        UNION ALL

        -- Recursive case: follow parent_role_id
        SELECT
          rh.role_id,
          r."parentRoleId" AS ancestor_role_id
          ,r.name
        FROM role_hierarchy rh
          JOIN "Role" r ON r.id = rh.ancestor_role_id
        WHERE r."parentRoleId" IS NOT NULL
      )
      INSERT INTO "FlattenedRolePermission" ("roleId", "permissionId", "organizationId")
      SELECT DISTINCT
        rh.role_id,pr."A", $1::uuid
      FROM role_hierarchy rh
        JOIN "_PermissionToRole" pr ON pr."B" = rh.ancestor_role_id
    `, organizationId);
  }
}
