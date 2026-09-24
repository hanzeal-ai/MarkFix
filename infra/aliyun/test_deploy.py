"""Run deployment control-flow checks without touching Docker or cloud services."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('deploy.sh')


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'commands.jsonl'
        self.deploy_root = self.root / 'markfix'
        self.env = dict(os.environ, PATH=f'{self.bin}:{os.environ["PATH"]}',
                        MARKFIX_DEPLOY_ROOT=str(self.deploy_root), TEST_LOG=str(self.log),
                        API_IMAGE='crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix/markfix-api@sha256:' + 'a' * 64,
                        DASHBOARD_IMAGE='crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix/markfix-dashboard@sha256:' + 'b' * 64)
        self.command('docker', '''import json,os,sys
from pathlib import Path
a=sys.argv[1:]
if a[:2]==['image','inspect']: sys.exit(1 if os.environ.get('FAIL_PHASE')=='inspect' else 0)
config=a[a.index('-f')+1]
with open(os.environ['TEST_LOG'],'a') as f:
 f.write(json.dumps({'args':a,'images':Path(config).with_name('images.env').read_text()})+'\\n')
failure=os.environ.get('FAIL_PHASE')
if 'pull' in a and failure=='pull': sys.exit(1)
if 'pg_dump' in a: print('-- database backup')
if 'psql' in a and failure=='unresolved': print('_prisma_migrations' if 'to_regclass' in a[-1] else 'historical_failed_migration')
if 'run' in a and 'migrate' in a and failure=='migrate': sys.exit(1)
if 'up' in a and 'api' in a and failure=='deploy' and '/current/' not in config: sys.exit(1)
''')
        self.command('curl', "import os,sys\nsys.exit(1 if os.environ.get('FAIL_PHASE')=='http' else 0)\n")
        self.command('flock', '''import fcntl,sys
try: fcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError: sys.exit(1)
''')

    def command(self, name, code):
        path = self.bin / name
        path.write_text('#!/usr/bin/env python3\n' + code)
        path.chmod(0o755)

    def run_deploy(self, **extra):
        return subprocess.run(['bash', str(SCRIPT)], env=dict(self.env, **extra),
                              text=True, capture_output=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_success_and_secret_reuse(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.deploy_root / 'current'
        self.assertTrue(current.is_symlink())
        secret = self.deploy_root / 'app.env'
        original = secret.read_text()
        self.assertEqual(secret.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(original.split('MARKFIX_DEMO_PASSWORD=')[1].strip(), result.stdout)
        calls = [x['args'] for x in self.calls()]
        backup = next(i for i, x in enumerate(calls) if 'pg_dump' in x)
        migration = next(i for i, x in enumerate(calls) if 'run' in x)
        app = next(i for i, x in enumerate(calls) if 'up' in x and 'api' in x)
        stop = next(i for i, x in enumerate(calls) if 'stop' in x)
        self.assertLess(backup, stop)
        self.assertLess(stop, migration)
        self.assertLess(migration, app)
        self.assertEqual(len(list((self.deploy_root / 'backups').glob('*.sql'))), 1)
        self.assertEqual(self.run_deploy().returncode, 0)
        self.assertEqual(secret.read_text(), original)

    def test_preloaded_images_use_no_registry_and_preserve_migration_checks(self):
        result = self.run_deploy(MARKFIX_LOADED_IMAGES='1', API_IMAGE='sha256:' + 'a' * 64,
                                 DASHBOARD_IMAGE='sha256:' + 'b' * 64)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [x['args'] for x in self.calls()]
        self.assertFalse(any('pull' in x for x in calls))
        for args in calls:
            if 'up' in args or 'run' in args:
                self.assertEqual(args[args.index('--pull') + 1], 'never')
        self.assertTrue(any('pg_dump' in x for x in calls))
        self.assertTrue(any('migrate' in x and 'run' in x for x in calls))

    def test_missing_loaded_image_does_not_stop_services(self):
        result = self.run_deploy(MARKFIX_LOADED_IMAGES='1', API_IMAGE='sha256:' + 'a' * 64,
                                 DASHBOARD_IMAGE='sha256:' + 'b' * 64, FAIL_PHASE='inspect')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_reject_mutable_or_shell_input(self):
        for variable in ['API_IMAGE', 'DASHBOARD_IMAGE']:
            for image in [
                'crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix/markfix-api:latest',
                'ghcr.io/hanzeal-ai/markfix-api@sha256:' + 'a' * 64,
                'crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com.example.com/markfix/markfix-api@sha256:' + 'a' * 64,
                'crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/other/markfix-api@sha256:' + 'a' * 64,
                'crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix/other@sha256:' + 'a' * 64,
                'crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix/markfix-api@sha256:short',
                '$(touch bad)', '',
            ]:
                with self.subTest(variable=variable, image=image):
                    self.assertNotEqual(self.run_deploy(**{variable: image}).returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_pull_failure_starts_nothing(self):
        self.assertNotEqual(self.run_deploy(FAIL_PHASE='pull').returncode, 0)
        self.assertFalse(any('up' in x['args'] for x in self.calls()))

    def test_unresolved_migration_keeps_existing_applications_running(self):
        result = self.run_deploy(FAIL_PHASE='unresolved')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Existing applications were not stopped', result.stderr)
        self.assertFalse(any('stop' in x['args'] or 'run' in x['args'] for x in self.calls()))

    def test_first_release_failure_stops_only_applications(self):
        self.assertNotEqual(self.run_deploy(FAIL_PHASE='deploy').returncode, 0)
        self.assertFalse((self.deploy_root / 'current').exists())
        self.assertEqual(self.calls()[-1]['args'][-3:], ['stop', 'api', 'dashboard'])

    def test_failed_update_stops_writers_and_requires_forward_repair(self):
        for phase in ['migrate', 'deploy', 'http']:
            with self.subTest(phase=phase):
                self.assertEqual(self.run_deploy().returncode, 0)
                before = (self.deploy_root / 'current').resolve()
                count = len(self.calls())
                result = self.run_deploy(FAIL_PHASE=phase,
                    API_IMAGE='crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix/markfix-api@sha256:' + 'c' * 64)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual((self.deploy_root / 'current').resolve(), before)
                calls = self.calls()[count:]
                args = [x['args'] for x in calls]
                stop = next(i for i, x in enumerate(args) if 'stop' in x)
                migration = next(i for i, x in enumerate(args) if 'run' in x)
                self.assertLess(stop, migration)
                self.assertEqual(args[-1][-3:], ['stop', 'api', 'dashboard'])
                self.assertTrue(all('c' * 64 in x['images'] for x in calls))
                if phase == 'migrate':
                    self.assertFalse(any('up' in x and 'api' in x for x in args))
                self.assertIn('Repair forward with the current contract', result.stderr)
                self.assertIn('Database backup:', result.stderr)
                self.assertIn('do not restart previous images', result.stderr)

    def test_concurrent_deploy_is_rejected(self):
        import fcntl
        self.deploy_root.mkdir()
        with (self.deploy_root / 'deploy.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Another MarkFix deployment', result.stderr)
        self.assertEqual(self.calls(), [])


if __name__ == '__main__':
    unittest.main()
