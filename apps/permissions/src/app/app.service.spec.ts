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
  });
});
