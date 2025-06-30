import { Test } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

describe('AppService', () => {
  let service: AppService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [AppService, PrismaService],
    }).compile();

    service = app.get<AppService>(AppService);
    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.permission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.group.deleteMany();
    await prisma.organization.deleteMany();
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      expect(service.getData()).toEqual({ message: 'Hello API' });
    });
  });

  describe('can', () => {
    it('returns true if org admin', async () => {
      const org = await prisma.organization.create({
        data: { name: 'ACME Inc.' },
      });

      const orgAdminRole = await prisma.role.create({
        data: { name: 'Org Admin', organizationId: org.id },
      });

      const user = await prisma.user.create({
        data: {
          name: 'Org Admin',
          roleId: orgAdminRole.id,
          organizationId: org.id,
        },
      });

      await prisma.organization.update({
        data: { adminId: user.id },
        where: { id: org.id },
      });

      expect(await service.can(user.id, 'anything')).toBe(true);
    });

    it('returns true if group has permission', async () => {
      const org = await prisma.organization.create({
        data: { name: 'ACME Inc.' },
      });

      const perm = await prisma.permission.create({
        data: { key: 'project:post', organizationId: org.id },
      });

      const group = await prisma.group.create({
        data: { name: 'Some group', permissions: { connect: { id: perm.id } }, organizationId: org.id },
      });

      const user = await prisma.user.create({
        data: {
          name: 'Some member',
          groupId: group.id,
          organizationId: org.id,
        },
      });

      expect(await service.can(user.id, perm.key)).toBe(true);
    });

    it('returns true if role has permission', async () => {
      const org = await prisma.organization.create({
        data: { name: 'ACME Inc.' },
      });

      const perm = await prisma.permission.create({
        data: { key: 'project:post', organizationId: org.id },
      });

      const memberRole = await prisma.role.create({
        data: { name: 'Member', permissions: { connect: { id: perm.id } }, organizationId: org.id },
      });

      const user = await prisma.user.create({
        data: {
          name: 'Some member',
          roleId: memberRole.id,
          organizationId: org.id,
        },
      });

      expect(await service.can(user.id, perm.key)).toBe(true);
    });
  });

  describe('canWithRecursion', () => {
    it('returns true if role hierarchy has permission', async () => {
      const org = await prisma.organization.create({
        data: { name: 'ACME Inc.' },
      });

      const perm = await prisma.permission.create({
        data: { key: 'project:post', organizationId: org.id },
      });

      const memberRole = await prisma.role.create({
        data: { name: 'Member', permissions: { connect: { id: perm.id } }, organizationId: org.id },
      });

      const groupAdminRole = await prisma.role.create({
        data: { name: 'Group Admin', parentRoleId: memberRole.id, organizationId: org.id },
      });

      const user = await prisma.user.create({
        data: {
          name: 'Group admin',
          roleId: groupAdminRole.id,
          organizationId: org.id,
        },
      });

      expect(await service.canWithRecursion(user.id, perm.key)).toBe(true);
    });
  });
});
