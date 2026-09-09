import { ArrowLeft } from '@markfix/ui/icons';
import { MarkFixMark } from '@markfix/ui';
import './legal-page.css';

type LegalDocument = {
  label: string;
  title: string;
  introduction: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
};

const documents: Record<'privacy' | 'terms', LegalDocument> = {
  privacy: {
    label: 'Privacy',
    title: '隐私政策',
    introduction: '本政策说明 MarkFix 在提供网站标注、团队协作与管理服务时如何处理你的信息。',
    sections: [
      {
        title: '我们处理的信息',
        paragraphs: [
          '账户信息，包括邮箱、显示名称、登录会话与项目成员关系。',
          '你主动创建或提交的项目、批注、截图、页面地址、评论与问题复现信息。',
          '保障服务安全和稳定所需的设备、版本、请求与错误信息。',
        ],
      },
      {
        title: '信息用途',
        paragraphs: [
          '用于提供登录、同步、协作、统计、问题处理和客户支持能力，并用于防止滥用和排查故障。MarkFix 不会出售你的个人信息。',
        ],
      },
      {
        title: '存储与保留',
        paragraphs: [
          '信息会在提供服务所需的期限内保留。账户注销后，属于个人项目的数据会删除；协作项目中的必要协作记录可能在移除身份信息后继续保留。',
        ],
      },
      {
        title: '你的选择',
        paragraphs: [
          '你可以在账户设置中导出账户数据或申请注销。若你仍拥有多人项目，需要先完成成员移交或移除。',
        ],
      },
      {
        title: '更新与联系',
        paragraphs: [
          '政策发生重要变化时，我们会在产品内或官网提示。隐私相关问题可通过官网公布的支持渠道联系我们。',
        ],
      },
    ],
  },
  terms: {
    label: 'Terms',
    title: '服务条款',
    introduction: '使用 MarkFix 即表示你同意遵守本条款以及产品内展示的套餐规则。',
    sections: [
      {
        title: '账户与访问',
        paragraphs: [
          '你需要提供准确的注册信息并妥善保管账户凭证。账户发生异常使用时，应及时修改密码并撤销相关会话。',
        ],
      },
      {
        title: '内容与网站权限',
        paragraphs: [
          '你保留所提交内容的权利，同时授权 MarkFix 在提供服务所需范围内存储、处理和展示这些内容。你应确保有权访问、截图和标注目标网站。',
        ],
      },
      {
        title: '合理使用',
        paragraphs: [
          '不得利用 MarkFix 侵害他人权益、绕过访问控制、传播恶意内容，或干扰产品及第三方系统的正常运行。',
        ],
      },
      {
        title: '套餐与变更',
        paragraphs: [
          '不同套餐包含不同的项目和成员额度。付费套餐的价格、周期、续费与退款条件以订购时展示的信息为准。',
        ],
      },
      {
        title: '服务与责任',
        paragraphs: [
          '我们会持续维护服务的可用性与安全性，但无法保证服务始终不中断。法律允许范围内，双方对间接或不可预见的损失不承担责任。',
        ],
      },
      {
        title: '终止与更新',
        paragraphs: [
          '你可以停止使用或注销账户。严重违反条款时，我们可以限制或终止访问。条款重大更新会通过产品或官网提示。',
        ],
      },
    ],
  },
};

export function LegalPage(): React.JSX.Element {
  const document = window.location.pathname === '/terms' ? documents.terms : documents.privacy;
  return (
    <main className="legal-shell">
      <nav className="legal-nav">
        <a href="/">
          <MarkFixMark size={28} />
          <strong>MarkFix</strong>
        </a>
        <a href="/">
          <ArrowLeft /> 返回首页
        </a>
      </nav>
      <article className="legal-document">
        <header>
          <p>{document.label}</p>
          <h1>{document.title}</h1>
          <span>更新日期：2026 年 9 月 5 日</span>
          <strong>{document.introduction}</strong>
        </header>
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <footer>
          <a href="/privacy">隐私政策</a>
          <a href="/terms">服务条款</a>
        </footer>
      </article>
    </main>
  );
}
