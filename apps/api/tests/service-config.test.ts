import { afterEach, expect, it, vi } from 'vitest';
import { apiServiceUrls } from '../src/service-config.js';
import { serviceConfig } from '@markfix/contracts';
import { AgentAuthService } from '../src/agent/agent-auth.service.js';
import { AgentController } from '../src/agent/agent.controller.js';
import type { DatabaseService } from '../src/database.service.js';
import type { AgentProjectService } from '../src/agent/agent-project.service.js';
import type { AgentFixService } from '../src/agent/agent-fix.service.js';
import type { AuthRateLimitService } from '../src/auth-rate-limit.service.js';
import type { AppService } from '../src/app.service.js';
import type { AuthenticatedUser } from '../src/current-user.decorator.js';

afterEach(() => vi.unstubAllEnvs());

it('selects the shared public origin for preview without changing its email mode', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('MARKFIX_SERVICE_MODE', 'production');
  vi.stubEnv('MARKFIX_SERVICE_ORIGIN', '');
  expect(apiServiceUrls().origin).toBe(serviceConfig.productionOrigin);
});

it('uses one configured origin for authorization links and rejects decisions from other origins', async () => {
  const origin = 'https://new-markfix.example';
  vi.stubEnv('MARKFIX_SERVICE_ORIGIN', origin);
  const auth = new AgentAuthService({
    agentDeviceRequest: { create: vi.fn() },
  } as unknown as DatabaseService);
  const result = await auth.begin({ deviceName: 'Test CLI', agentType: 'codex' });
  expect(result.verificationUrl).toBe(`${origin}/agent/authorize?code=${result.userCode}`);
  const decide = vi.spyOn(auth, 'decide').mockResolvedValue({ approved: true });
  const controller = new AgentController(
    auth,
    {} as AgentProjectService,
    {} as AgentFixService,
    { consume: vi.fn() } as unknown as AuthRateLimitService,
    {} as AppService,
  );
  const user = { id: 'user' } as AuthenticatedUser;
  for (const invalid of [
    undefined,
    'https://old-markfix.example',
    `${origin}.evil.example`,
    `${origin}/path`,
  ]) {
    expect(() => controller.decision(user, invalid, {})).toThrow(
      'Authorize from the MarkFix website',
    );
  }
  expect(decide).not.toHaveBeenCalled();
  await controller.decision(user, origin, {});
  expect(decide).toHaveBeenCalledWith('user', {});
});
