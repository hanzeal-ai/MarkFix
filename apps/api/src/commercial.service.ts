import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Prisma } from '@markfix/database';
import { z } from 'zod';
import { DatabaseService } from './database.service.js';

const annotationInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().min(1).max(4000),
  kind: z.enum(['ELEMENT', 'SCREENSHOT', 'COMMENT']),
  pageUrl: z.url(),
  authorId: z.uuid().optional(),
});

const annotationUpdateSchema = annotationInputSchema
  .partial()
  .extend({ status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED']).optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const rejectionSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
const categorySchema = z.object({ category: z.string().trim().min(1).max(40) });

const annotationInclude = {
  author: { select: { id: true, displayName: true, email: true } },
} as const;

@Injectable()
export class CommercialService implements OnApplicationBootstrap {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.MARKFIX_DEMO_PASSWORD) return;
    await this.seedLocalShowcase();
  }

  async overview(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    await this.syncReportAnnotations({ workspaceId });
    const [projects, members] = await Promise.all([
      this.database.project.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        include: { annotations: { include: annotationInclude, orderBy: { updatedAt: 'desc' } } },
      }),
      this.database.membership.findMany({
        where: { workspaceId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      }),
    ]);
    const annotations = projects.flatMap((project) =>
      project.annotations.map((annotation) => ({ ...annotation, category: project.category })),
    );
    const countStatus = (status: string) =>
      annotations.filter((annotation) => annotation.status === status).length;

    return {
      metrics: {
        projects: projects.length,
        annotations: annotations.length,
        pending: annotations.filter((annotation) =>
          ['OPEN', 'IN_REVIEW'].includes(annotation.status),
        ).length,
        rejected: countStatus('REJECTED'),
      },
      projects: projects.map(({ annotations: items, ...project }) => ({
        ...project,
        annotationCount: items.length,
        pendingCount: items.filter((item) => ['OPEN', 'IN_REVIEW'].includes(item.status)).length,
        rejectedCount: items.filter((item) => item.status === 'REJECTED').length,
        resolvedCount: items.filter((item) => item.status === 'RESOLVED').length,
      })),
      users: members.map(({ user, role }) => {
        const authored = annotations.filter((annotation) => annotation.authorId === user.id);
        const categoryCounts = new Map<string, number>();
        for (const annotation of authored) {
          categoryCounts.set(
            annotation.category,
            (categoryCounts.get(annotation.category) ?? 0) + 1,
          );
        }
        return {
          ...user,
          role,
          annotationCount: authored.length,
          rejectedCount: authored.filter((annotation) => annotation.status === 'REJECTED').length,
          projectCategories: [...categoryCounts.entries()].map(([category, count]) => ({
            category,
            count,
          })),
        };
      }),
    };
  }

  async annotations(userId: string, projectId: string) {
    await this.requireProject(userId, projectId);
    await this.syncReportAnnotations({ projectId });
    return this.database.managedAnnotation.findMany({
      where: { projectId },
      include: annotationInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createAnnotation(userId: string, projectId: string, input: unknown) {
    await this.requireProjectManager(userId, projectId);
    const parsed = annotationInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    if (parsed.data.authorId) await this.requireWorkspaceUser(projectId, parsed.data.authorId);
    const { authorId, ...annotation } = parsed.data;
    return this.database.managedAnnotation.create({
      data: { projectId, authorId: authorId ?? userId, ...annotation },
      include: annotationInclude,
    });
  }

  async updateAnnotation(userId: string, annotationId: string, input: unknown) {
    const annotation = await this.requireAnnotationManager(userId, annotationId);
    const parsed = annotationUpdateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    if (parsed.data.authorId)
      await this.requireWorkspaceUser(annotation.projectId, parsed.data.authorId);
    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as Prisma.ManagedAnnotationUncheckedUpdateInput;
    if (parsed.data.status) data.rejectionReason = null;
    if (annotation.sourceReportId) {
      const report = await this.database.report.findUnique({
        where: { id: annotation.sourceReportId },
        select: { captureBundle: true },
      });
      if (!report) throw new NotFoundException('Source report not found');
      const captureBundle = report.captureBundle as {
        page?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const reportData: Prisma.ReportUncheckedUpdateInput = {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.note !== undefined ? { description: parsed.data.note } : {}),
        ...(parsed.data.authorId !== undefined ? { reporterId: parsed.data.authorId } : {}),
        ...(parsed.data.status !== undefined
          ? { status: this.reportStatus(parsed.data.status), rejectionReason: null }
          : {}),
        ...(parsed.data.pageUrl !== undefined
          ? {
              captureBundle: {
                ...captureBundle,
                page: { ...captureBundle.page, url: parsed.data.pageUrl },
              } as Prisma.InputJsonValue,
            }
          : {}),
      };
      const [updated] = await this.database.$transaction([
        this.database.managedAnnotation.update({
          where: { id: annotationId },
          data,
          include: annotationInclude,
        }),
        this.database.report.update({ where: { id: annotation.sourceReportId }, data: reportData }),
      ]);
      return updated;
    }
    return this.database.managedAnnotation.update({
      where: { id: annotationId },
      data,
      include: annotationInclude,
    });
  }

  async rejectAnnotation(userId: string, annotationId: string, input: unknown) {
    const annotation = await this.requireAnnotationManager(userId, annotationId);
    const parsed = rejectionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    if (annotation.sourceReportId) {
      const [updated] = await this.database.$transaction([
        this.database.managedAnnotation.update({
          where: { id: annotationId },
          data: { status: 'REJECTED', rejectionReason: parsed.data.reason },
          include: annotationInclude,
        }),
        this.database.report.update({
          where: { id: annotation.sourceReportId },
          data: { status: 'CLOSED', rejectionReason: parsed.data.reason },
        }),
      ]);
      return updated;
    }
    return this.database.managedAnnotation.update({
      where: { id: annotationId },
      data: { status: 'REJECTED', rejectionReason: parsed.data.reason },
      include: annotationInclude,
    });
  }

  async deleteAnnotation(userId: string, annotationId: string) {
    const annotation = await this.requireAnnotationManager(userId, annotationId);
    if (annotation.sourceReportId) {
      throw new BadRequestException('Submitted annotations cannot be deleted; reject them instead');
    }
    await this.database.managedAnnotation.delete({ where: { id: annotationId } });
    return { deleted: true };
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

  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.database.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE')
      throw new ForbiddenException('You do not have access to this workspace');
    return membership;
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.requireMembership(userId, project.workspaceId);
    return project;
  }

  private async requireProjectManager(userId: string, projectId: string) {
    const project = await this.requireProject(userId, projectId);
    const membership = await this.requireMembership(userId, project.workspaceId);
    if (!['OWNER', 'ADMIN'].includes(membership.role))
      throw new ForbiddenException('Only workspace managers can change annotations');
    return project;
  }

  private async requireAnnotationManager(userId: string, annotationId: string) {
    const annotation = await this.database.managedAnnotation.findUnique({
      where: { id: annotationId },
      include: { project: true },
    });
    if (!annotation) throw new NotFoundException('Annotation not found');
    await this.requireProjectManager(userId, annotation.projectId);
    return annotation;
  }

  private async requireWorkspaceUser(projectId: string, targetUserId: string) {
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.database.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: targetUserId } },
    });
    if (!membership || membership.status !== 'ACTIVE')
      throw new BadRequestException('Author must be an active workspace member');
  }

  private async syncReportAnnotations(scope: { workspaceId: string } | { projectId: string }) {
    const reports = await this.database.report.findMany({
      where:
        'projectId' in scope
          ? { projectId: scope.projectId }
          : { project: { workspaceId: scope.workspaceId } },
      select: {
        id: true,
        projectId: true,
        reporterId: true,
        title: true,
        description: true,
        status: true,
        rejectionReason: true,
        captureBundle: true,
        createdAt: true,
      },
    });
    if (!reports.length) return;
    const imported = await this.database.managedAnnotation.findMany({
      where: { sourceReportId: { in: reports.map(({ id }) => id) } },
      select: {
        id: true,
        sourceReportId: true,
        projectId: true,
        authorId: true,
        title: true,
        note: true,
        kind: true,
        pageUrl: true,
        status: true,
        rejectionReason: true,
      },
    });
    const importedByReport = new Map(imported.map((item) => [item.sourceReportId, item]));
    const statusMap = {
      OPEN: 'OPEN',
      IN_PROGRESS: 'IN_REVIEW',
      READY_FOR_VERIFY: 'IN_REVIEW',
      RESOLVED: 'RESOLVED',
      CLOSED: 'RESOLVED',
    } as const;
    const synchronized = reports.map((report) => {
      const captureBundle = report.captureBundle as {
        page?: { url?: unknown };
        annotations?: unknown[];
      };
      const pageUrl =
        typeof captureBundle.page?.url === 'string'
          ? captureBundle.page.url
          : 'https://markfix.local';
      return {
        sourceReportId: report.id,
        projectId: report.projectId,
        authorId: report.reporterId,
        title: report.title,
        note: report.description,
        kind: captureBundle.annotations?.length ? ('SCREENSHOT' as const) : ('COMMENT' as const),
        pageUrl,
        status: report.rejectionReason ? ('REJECTED' as const) : statusMap[report.status],
        rejectionReason: report.rejectionReason,
        createdAt: report.createdAt,
      };
    });
    const pending = synchronized.filter(
      ({ sourceReportId }) => !importedByReport.has(sourceReportId),
    );
    if (pending.length) {
      await this.database.managedAnnotation.createMany({ data: pending, skipDuplicates: true });
    }
    const updates = synchronized.flatMap((next) => {
      const current = importedByReport.get(next.sourceReportId);
      if (!current) return [];
      const changed =
        current.projectId !== next.projectId ||
        current.authorId !== next.authorId ||
        current.title !== next.title ||
        current.note !== next.note ||
        current.kind !== next.kind ||
        current.pageUrl !== next.pageUrl ||
        current.status !== next.status ||
        current.rejectionReason !== next.rejectionReason;
      return changed
        ? [
            this.database.managedAnnotation.update({
              where: { id: current.id },
              data: {
                projectId: next.projectId,
                authorId: next.authorId,
                title: next.title,
                note: next.note,
                kind: next.kind,
                pageUrl: next.pageUrl,
                status: next.status,
                rejectionReason: next.rejectionReason,
              },
            }),
          ]
        : [];
    });
    if (updates.length) await this.database.$transaction(updates);
  }

  private reportStatus(status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED') {
    return status === 'IN_REVIEW' ? ('IN_PROGRESS' as const) : status;
  }

  private async seedLocalShowcase(): Promise<void> {
    const email = process.env.MARKFIX_DEMO_EMAIL ?? 'admin@markfix.local';
    const owner = await this.database.user.findUnique({ where: { email } });
    if (!owner) return;
    const workspace = await this.database.workspace.findFirst({ where: { createdById: owner.id } });
    if (!workspace) return;
    await this.database.workspace.update({
      where: { id: workspace.id },
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
    for (const member of demoMembers) {
      await this.database.membership.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
        update: { status: 'ACTIVE' },
        create: { workspaceId: workspace.id, userId: member.id, role: 'MEMBER' },
      });
    }
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
        where: { workspaceId: workspace.id, name: seed.name },
      });
      projects.push(
        current
          ? await this.database.project.update({ where: { id: current.id }, data: seed })
          : await this.database.project.create({ data: { workspaceId: workspace.id, ...seed } }),
      );
    }
    if (
      (await this.database.managedAnnotation.count({
        where: { project: { workspaceId: workspace.id } },
      })) > 0
    )
      return;
    const [website, dashboard, help] = projects;
    if (!website || !dashboard || !help) return;
    await this.database.managedAnnotation.createMany({
      data: [
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
          status: 'IN_REVIEW',
        },
        {
          projectId: dashboard.id,
          authorId: owner.id,
          title: '项目列表需要展示待处理数量',
          note: '无需进入详情即可判断项目处理压力。',
          kind: 'SCREENSHOT',
          pageUrl: 'https://app.markfix.local/projects',
          status: 'RESOLVED',
        },
        {
          projectId: dashboard.id,
          authorId: lin.id,
          title: '状态筛选命名不清晰',
          note: '“全部”与“待处理”同时出现时容易误解统计口径。',
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
      ],
    });
  }
}
