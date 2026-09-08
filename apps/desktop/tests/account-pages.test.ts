import { describe, expect, it } from 'vitest';
import { accountPageUrl } from '../src/account-pages.js';
import { projectErrorMessage } from '../src/renderer/src/project-error.js';

describe('account page boundary', () => {
  it.each(['register', 'forgot-password', 'privacy', 'terms'])(
    'opens only the configured %s page',
    (page) => {
      expect(accountPageUrl(page, 'https://markfix.example')).toBe(
        `https://markfix.example/${page}`,
      );
      expect(accountPageUrl(page, 'http://localhost:4311')).toBe(`http://localhost:4311/${page}`);
    },
  );
  it.each(['https://evil.example', '//evil.example', '../app', 'register?next=evil', '', null])(
    'rejects arbitrary destinations: %s',
    (page) => {
      expect(() => accountPageUrl(page, 'https://markfix.example')).toThrow();
    },
  );
  it.each([
    'javascript:alert(1)',
    'file:///tmp/',
    'http://public.example',
    'https://u:p@markfix.example',
    'https://markfix.example/path',
    'https://markfix.example?next=evil',
  ])('rejects unsafe origins: %s', (origin) => {
    expect(() => accountPageUrl('register', origin)).toThrow();
  });
});

describe('project error messages', () => {
  it('translates HTTPS failures without exposing the IPC implementation', () => {
    expect(
      projectErrorMessage(
        new Error(
          "Error invoking remote method 'website-project:create': Error: Enter a valid HTTPS website address",
        ),
      ),
    ).toBe('请输入有效的 HTTPS 网站地址，例如 https://example.com。');
    expect(projectErrorMessage(new Error('fetch failed'))).toBe('无法连接服务，请检查网络后重试。');
    expect(
      projectErrorMessage(
        new Error(
          "Error invoking remote method 'website-project:create': Error: 当前账号没有权限。",
        ),
      ),
    ).toBe('当前账号没有权限。');
    expect(projectErrorMessage(new Error('SQL internal error'))).toBe(
      '创建项目失败，请检查网站地址或稍后重试。',
    );
  });
});
