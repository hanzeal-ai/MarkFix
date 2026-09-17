import {
  commercialAnnotationInputSchema as annotationInputSchema,
  commercialAnnotationListQuerySchema as annotationListQuerySchema,
  commercialAnnotationUpdateSchema as annotationUpdateSchema,
  commercialCategorySchema as categorySchema,
  commercialRejectionSchema as rejectionSchema,
} from '@markfix/contracts';
import { Prisma } from '@markfix/database';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  annotationHistoryForReport,
  reportAnnotationStatus,
  reportStatusForAnnotation,
  reportToCommercialAnnotation,
  submissionSourceAnnotationId,
  updateReportBundle,
} from './commercial/report-annotation.js';
import {
  createCommercialReport,
  migrateLegacyManagedAnnotations,
} from './commercial/report-writer.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class CommercialService implements OnApplicationBootstrap {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    await migrateLegacyManagedAnnotations(this.database);
    if (process.env.MARKFIX_DEMO_PASSWORD) await this.seedLocalShowcase();
  }

  async overview(userId: string) {
    return this.buildOverview(userId);
  }

  async bootstrap(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { emailVerifiedAt, ...publicUser } = user;
    return {
      user: { ...publicUser, emailVerified: Boolean(emailVerifiedAt) },
      overview: await this.buildOverview(userId),
    };
  }

  private async buildOverview(userId: string) {
    const projects = await this.database.project.findMany({
      where: { memberships: { some: { userId, status: 'ACTIVE' } } },
      include: { memberships: { where: { userId, status: 'ACTIVE' }, select: { role: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const projectIds = projects.map(({ id }) => id);
    const [members, reports] = await Promise.all([
      this.database.membership.findMany({
        where: { projectId: { in: projectIds }, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      }),
      this.database.report.findMany({ where: { projectId: { in: projectIds } } }),
    ]);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const projectCounts = new Map<
      string,
      { annotations: number; pending: number; rejected: number; resolved: number; failed: number }
    >();
    const userCounts = new Map<
      string,
      { annotations: number; rejected: number; categories: Map<string, number> }
    >();
    const metrics = { projects: projects.length, annotations: 0, pending: 0, rejected: 0 };

    const groups = reports.map((report) => ({
      projectId: report.projectId,
      authorId: report.reporterId,
      status: reportAnnotationStatus(report),
      count: 1,
    }));

    for (const group of groups) {
      const count = group.count;
      metrics.annotations += count;
      if (group.status === 'OPEN') metrics.pending += count;
      if (group.status === 'REJECTED') metrics.rejected += count;

      const projectCount = projectCounts.get(group.projectId) ?? {
        annotations: 0,
        pending: 0,
        rejected: 0,
        resolved: 0,
        failed: 0,
      };
      projectCount.annotations += count;
      if (group.status === 'OPEN') projectCount.pending += count;
      if (group.status === 'REJECTED') projectCount.rejected += count;
      if (group.status === 'RESOLVED') projectCount.resolved += count;
      if (group.status === 'FIX_FAILED') projectCount.failed += count;
      projectCounts.set(group.projectId, projectCount);

      if (!group.authorId) continue;
      const userCount = userCounts.get(group.authorId) ?? {
        annotations: 0,
        rejected: 0,
        categories: new Map<string, number>(),
      };
      userCount.annotations += count;
      if (group.status === 'REJECTED') userCount.rejected += count;
      const category = projectById.get(group.projectId)?.category;
      if (category)
        userCount.categories.set(category, (userCount.categories.get(category) ?? 0) + count);
      userCounts.set(group.authorId, userCount);
    }

    return {
      metrics,
      projects: projects.map(({ memberships, ...project }) => ({
        ...project,
        role: memberships[0]?.role,
        annotationCount: projectCounts.get(project.id)?.annotations ?? 0,
        pendingCount: projectCounts.get(project.id)?.pending ?? 0,
        rejectedCount: projectCounts.get(project.id)?.rejected ?? 0,
        resolvedCount: projectCounts.get(project.id)?.resolved ?? 0,
        failedCount: projectCounts.get(project.id)?.failed ?? 0,
        memberCount: members.filter((member) => member.projectId === project.id).length,
      })),
      users: [...new Map(members.map((member) => [member.userId, member])).values()].map(
        ({ user }) => {
          const counts = userCounts.get(user.id);
          return {
            ...user,
            projectRoles: Object.fromEntries(
              members
                .filter((member) => member.userId === user.id)
                .map((member) => [member.projectId, member.role]),
            ),
            projectIds: members
              .filter((member) => member.userId === user.id)
              .map((member) => member.projectId),
            annotationCount: counts?.annotations ?? 0,
            rejectedCount: counts?.rejected ?? 0,
            projectCategories: [...(counts?.categories.entries() ?? [])].map(
              ([category, count]) => ({
                category,
                count,
              }),
            ),
          };
        },
      ),
    };
  }

  async annotations(userId: string, projectId: string, query: unknown = {}) {
    await this.requireProject(userId, projectId);
    const parsedResult = annotationListQuerySchema.safeParse(query);
    if (!parsedResult.success)
      throw new BadRequestException(parsedResult.error.issues[0]?.message ?? 'Invalid query');
    const parsed = parsedResult.data;
    const [reports, submissions] = await Promise.all([
      this.database.report.findMany({
        where: { projectId },
        include: {
          fixAttempts: { orderBy: { createdAt: 'desc' }, take: 10 },
          reporter: { select: { id: true, displayName: true, email: true } },
          activities: {
            include: { actor: { select: { id: true, displayName: true, email: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.database.reportSubmission.findMany({
        where: { projectId, status: 'FINALIZED' },
        include: {
          artifact: { select: { id: true } },
          createdBy: { select: { id: true, displayName: true, email: true } },
        },
      }),
    ]);
    const normalizedQuery = parsed.query?.toLocaleLowerCase();
    const groupedSubmissions = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const sourceId = submissionSourceAnnotationId(submission);
      if (!sourceId) continue;
      groupedSubmissions.set(sourceId, [...(groupedSubmissions.get(sourceId) ?? []), submission]);
    }
    const allItems = reports
      .map((report) =>
        reportToCommercialAnnotation(
          report,
          annotationHistoryForReport(report, groupedSubmissions.get(report.id) ?? []),
        ),
      )
      .filter((annotation) => !parsed.status || annotation.status === parsed.status)
      .filter(
        (annotation) =>
          !normalizedQuery ||
          `${annotation.referenceCode} ${annotation.title} ${annotation.note} ${annotation.pageUrl}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
      )
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    const offset = (parsed.page - 1) * parsed.pageSize;
    return {
      items: allItems.slice(offset, offset + parsed.pageSize),
      total: allItems.length,
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  async createAnnotation(userId: string, projectId: string, input: unknown) {
    await this.requireProjectManager(userId, projectId);
    const parsed = annotationInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    if (parsed.data.authorId) await this.requireProjectUser(projectId, parsed.data.authorId);
    const { authorId, ...annotation } = parsed.data;
    const report = await createCommercialReport(this.database, {
      projectId,
      authorId: authorId ?? userId,
      ...annotation,
    });
    return reportToCommercialAnnotation(report);
  }

  async updateAnnotation(userId: string, annotationId: string, input: unknown) {
    const target = await this.requireAnnotationManager(userId, annotationId);
    const parsed = annotationUpdateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    if (parsed.data.authorId) await this.requireProjectUser(target.projectId, parsed.data.authorId);
    const reportData: Prisma.ReportUncheckedUpdateInput = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.note !== undefined ? { description: parsed.data.note } : {}),
      ...(parsed.data.authorId !== undefined ? { reporterId: parsed.data.authorId } : {}),
      ...(parsed.data.status !== undefined
        ? { status: reportStatusForAnnotation(parsed.data.status), rejectionReason: null }
        : {}),
      ...(parsed.data.kind !== undefined || parsed.data.pageUrl !== undefined
        ? {
            captureBundle: updateReportBundle(target.captureBundle, {
              ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
              ...(parsed.data.pageUrl ? { pageUrl: parsed.data.pageUrl } : {}),
            }),
          }
        : {}),
      version: { increment: 1 },
    };
    const updated = await this.database.report.update({
      where: { id: target.id },
      data: {
        ...reportData,
        ...(parsed.data.status !== undefined &&
        parsed.data.status !== reportAnnotationStatus(target)
          ? {
              activities: {
                create: {
                  type: 'ANNOTATION_STATUS_CHANGED',
                  actorId: userId,
                  payload: { status: parsed.data.status },
                },
              },
            }
          : {}),
      },
      include: { reporter: { select: { id: true, displayName: true, email: true } } },
    });
    return reportToCommercialAnnotation(updated);
  }

  async deleteAnnotation(userId: string, annotationId: string) {
    const target = await this.requireAnnotationManager(userId, annotationId);
    await this.database.report.delete({ where: { id: target.id } });
    return { deleted: true };
  }

  async rejectAnnotation(userId: string, annotationId: string, input: unknown) {
    const target = await this.requireAnnotationManager(userId, annotationId);
    const parsed = rejectionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const updated = await this.database.report.update({
      where: { id: target.id },
      data: {
        status: 'CLOSED',
        rejectionReason: parsed.data.reason,
        version: { increment: 1 },
        activities: {
          create: {
            type: 'ANNOTATION_REJECTED',
            actorId: userId,
            payload: { reason: parsed.data.reason },
          },
        },
      },
      include: { reporter: { select: { id: true, displayName: true, email: true } } },
    });
    return reportToCommercialAnnotation(updated);
  }

  async updateProjectCategory(userId: string, projectId: string, input: unknown) {
    await this.requireProjectManager(userId, projectId);
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.database.project.update({
      where: { id: projectId },
      data: { category: parsed.data.category },
    });
  }

  private async requireMembership(userId: string, projectId: string) {
    const membership = await this.database.membership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE')
      throw new ForbiddenException('You do not have access to this project');
    return membership;
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.requireMembership(userId, project.id);
    return project;
  }

  private async requireProjectManager(userId: string, projectId: string) {
    const project = await this.requireProject(userId, projectId);
    const membership = await this.requireMembership(userId, project.id);
    if (!['OWNER', 'ADMIN'].includes(membership.role))
      throw new ForbiddenException('Only project managers can change annotations');
    return project;
  }

  private async requireAnnotationManager(userId: string, annotationId: string) {
    const report = await this.database.report.findUnique({ where: { id: annotationId } });
    if (report) await this.requireProjectManager(userId, report.projectId);
    if (report) return report;
    throw new NotFoundException('Annotation not found');
  }

  private async requireProjectUser(projectId: string, targetUserId: string) {
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.database.membership.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: targetUserId } },
    });
    if (!membership || membership.status !== 'ACTIVE')
      throw new BadRequestException('Author must be an active project member');
  }

  private async seedLocalShowcase(): Promise<void> {
    const email = process.env.MARKFIX_DEMO_EMAIL ?? 'admin@markfix.local';
    const owner = await this.database.user.findUnique({ where: { email } });
    if (!owner) return;
    await this.database.user.update({
      where: { id: owner.id },
      data: { plan: 'TEAM', upgradeRequestedAt: null },
    });
    const demoMembers = await Promise.all(
      [
        { email: 'lin@markfix.local', displayName: '林乔' },
        { email: 'zhou@markfix.local', displayName: '周然' },
      ].map(({ email: memberEmail, displayName }) =>
        this.database.user.upsert({
          where: { email: memberEmail },
          update: { displayName },
          create: { email: memberEmail, displayName, emailVerifiedAt: new Date() },
        }),
      ),
    );
    const [lin, zhou] = demoMembers;
    if (!lin || !zhou) return;
    const projectSeeds = [
      { name: 'MarkFix 官网', baseUrl: 'https://markfix.local', category: '品牌官网' },
      { name: '管理后台', baseUrl: 'https://app.markfix.local', category: 'SaaS 产品' },
      { name: '帮助中心', baseUrl: 'https://help.markfix.local', category: '内容站点' },
    ];
    const projects = [];
    for (const seed of projectSeeds) {
      const current = await this.database.project.findFirst({
        where: { ownerId: owner.id, name: seed.name },
      });
      projects.push(
        current
          ? await this.database.project.update({ where: { id: current.id }, data: seed })
          : await this.database.project.create({
              data: {
                ownerId: owner.id,
                ...seed,
                memberships: {
                  create: [
                    { userId: owner.id, role: 'OWNER' },
                    ...demoMembers.map((member) => ({
                      userId: member.id,
                      role: 'MEMBER' as const,
                    })),
                  ],
                },
              },
            }),
      );
    }
    if ((await this.database.report.count({ where: { project: { ownerId: owner.id } } })) > 0)
      return;
    const [website, dashboard, help] = projects;
    if (!website || !dashboard || !help) return;
    await Promise.all(
      (
        [
          {
            projectId: website.id,
            authorId: lin.id,
            title: '主标题在小屏下换行过早',
            note: '建议收紧标题最大宽度，并保留行动按钮的完整展示。',
            kind: 'ELEMENT',
            pageUrl: 'https://markfix.local/#hero',
            status: 'OPEN',
          },
          {
            projectId: website.id,
            authorId: zhou.id,
            title: '套餐对比缺少团队版权益',
            note: '补充无限项目和成员管理说明。',
            kind: 'COMMENT',
            pageUrl: 'https://markfix.local/#pricing',
            status: 'OPEN',
          },
          {
            projectId: dashboard.id,
            authorId: owner.id,
            title: '项目列表需要展示未处理数量',
            note: '无需进入详情即可判断项目处理压力。',
            kind: 'SCREENSHOT',
            pageUrl: 'https://app.markfix.local/projects',
            status: 'RESOLVED',
          },
          {
            projectId: dashboard.id,
            authorId: lin.id,
            title: '状态筛选命名不清晰',
            note: '“全部”与“未处理”同时出现时容易误解统计口径。',
            kind: 'ELEMENT',
            pageUrl: 'https://app.markfix.local/overview',
            status: 'REJECTED',
            rejectionReason: '现有命名与团队流程一致，暂不调整。',
          },
          {
            projectId: help.id,
            authorId: zhou.id,
            title: '快捷键文档缺少 macOS 说明',
            note: '补充 Command 与 Control 的平台差异。',
            kind: 'COMMENT',
            pageUrl: 'https://help.markfix.local/shortcuts',
            status: 'OPEN',
          },
        ] as const
      ).map((annotation) => createCommercialReport(this.database, annotation)),
    );
  }
}
