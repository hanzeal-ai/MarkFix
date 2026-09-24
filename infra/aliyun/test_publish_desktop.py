"""Installer integrity, immutable storage, policy isolation and failure recovery."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import publish_desktop as release


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'artifact'
        self.source.mkdir()
        self.commit = 'a' * 40
        name = 'MarkFix-0.1.0-windows-x64-setup.exe'
        data = b'installer-fixture'
        (self.source / name).write_bytes(data)
        self.manifest = dict(schemaVersion=1, platform='windows', arch='x64',
                             distribution='trial', version='0.1.0', commit=self.commit,
                             origin='https://markfix.hanzeal.com',
                             files=[dict(name=name, size=len(data), sha256=hashlib.sha256(data).hexdigest())])
        self.save()

    def save(self):
        (self.source / 'download-manifest.json').write_text(json.dumps(self.manifest))

    def test_integrity_and_immutable_retries(self):
        manifest = release.validate_artifact(self.source, self.commit)
        destination, relative = release.stage_artifact(self.source, self.root / 'downloads', manifest)
        self.assertEqual(relative.parts, ('windows', '0.1.0', self.commit))
        self.assertEqual(release.stage_artifact(self.source, self.root / 'downloads', manifest)[0], destination)
        (destination / manifest['files'][0]['name']).write_bytes(b'tampered')
        with self.assertRaises(ValueError):
            release.stage_artifact(self.source, self.root / 'downloads', manifest)

    def test_reject_tampered_artifact(self):
        (self.source / self.manifest['files'][0]['name']).write_bytes(b'tampered')
        with self.assertRaises(ValueError):
            release.validate_artifact(self.source, self.commit)

    def test_reject_paths_origins_and_wrong_commit(self):
        for key, value in [('version', '../1'), ('commit', 'b' * 40),
                           ('origin', 'http://example.test'), ('origin', 'https://u:p@example.test'),
                           ('origin', 'https://example.test/other'), ('origin', 'https://127.0.0.1'), ('origin', 'https://other.example.com'), ('arch', 'arm64')]:
            original = self.manifest[key]
            self.manifest[key] = value
            self.save()
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                release.validate_artifact(self.source, self.commit)
            self.manifest[key] = original

    def test_mac_trial_disables_native_feed_and_preserves_other_settings(self):
        self.manifest.update(platform='macos', arch='arm64')
        self.manifest['files'][0]['name'] = 'MarkFix-0.1.0-arm64.dmg'
        changes = release.policy_changes(self.manifest, Path('macos/0.1.0') / self.commit)
        self.assertEqual(changes['MARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL'], '')
        original = '# configuration\nSECRET=keep\nMARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION=0.3.0\nMARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL=old\n'
        result = release.replace_env(original, changes)
        self.assertIn('SECRET=keep\n', result)
        self.assertIn('MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION=0.3.0\n', result)
        self.assertNotIn('=old', result)

    def prepare_deployment(self):
        root = self.root / 'deployment'
        root.mkdir()
        current = root / 'releases/release-test'
        current.mkdir(parents=True)
        (root / 'current').symlink_to(current)
        (current / 'images.env').write_text('API_IMAGE=sha256:' + 'a' * 64 + '\nDASHBOARD_IMAGE=sha256:' + 'b' * 64 + '\n')
        (current / 'source.sha').write_text(self.commit)
        (root / 'app.env').write_text('SECRET=preserved\n')
        return root

    def test_failed_public_download_never_changes_policy(self):
        root = self.prepare_deployment()
        with patch.object(release, 'verify_public', side_effect=ValueError('bad checksum')), patch.object(release, 'run_compose') as run:
            with self.assertRaises(ValueError):
                release.publish(self.source, root, self.commit)
        self.assertEqual((root / 'app.env').read_text(), 'SECRET=preserved\n')
        run.assert_not_called()

    def test_failed_api_verification_restores_policy_and_restarts(self):
        root = self.prepare_deployment()
        with patch.object(release, 'verify_public'), patch.object(release, 'run_compose') as run, patch.object(release, 'urlopen', return_value=io.BytesIO(b'{}')):
            with self.assertRaises(ValueError):
                release.publish(self.source, root, self.commit)
        self.assertEqual((root / 'app.env').read_text(), 'SECRET=preserved\n')
        self.assertEqual(run.call_count, 2)
        self.assertEqual((root / 'app.env').stat().st_mode & 0o777, 0o600)

    def test_compose_timeout_terminates_group_before_raising(self):
        with patch.object(release.subprocess, 'Popen') as popen, patch.object(release.os, 'killpg') as killpg:
            process = popen.return_value
            process.pid = 12345
            process.wait.side_effect = [release.subprocess.TimeoutExpired(['docker'], 240), 0, 0]
            with self.assertRaises(release.subprocess.TimeoutExpired):
                release.run_compose(['docker', 'compose', 'up'], {})
            self.assertEqual(killpg.call_args_list[0].args, (12345, release.signal.SIGTERM))
            self.assertEqual(killpg.call_args_list[1].args, (12345, release.signal.SIGKILL))

    def test_compose_timeout_restores_previous_policy(self):
        root = self.prepare_deployment()
        with patch.object(release, 'verify_public'), patch.object(release, 'run_compose',
                side_effect=[release.subprocess.TimeoutExpired(['docker'], 240), None]) as run:
            with self.assertRaises(release.subprocess.TimeoutExpired):
                release.publish(self.source, root, self.commit)
        self.assertEqual((root / 'app.env').read_text(), 'SECRET=preserved\n')
        self.assertEqual(run.call_count, 2)

    def test_unsafe_deployment_paths_or_image_configuration_are_rejected(self):
        root = self.prepare_deployment()
        env = root / 'app.env'
        original = root / 'original.env'
        env.rename(original)
        env.symlink_to(original)
        with self.assertRaises(ValueError):
            release.publish(self.source, root, self.commit)
        env.unlink()
        original.rename(env)
        images = root / 'current/images.env'
        images.write_text('API_IMAGE=evil:latest\nDASHBOARD_IMAGE=evil:latest\n')
        with self.assertRaises(ValueError):
            release.publish(self.source, root, self.commit)
        (root / 'current').unlink()
        (root / 'current').symlink_to(self.source)
        with self.assertRaises(ValueError):
            release.publish(self.source, root, self.commit)

    def test_wrong_deployed_commit_does_not_stage_files(self):
        root = self.prepare_deployment()
        (root / 'current/source.sha').write_text('b' * 40)
        with self.assertRaises(ValueError):
            release.publish(self.source, root, self.commit)
        self.assertFalse((root / 'downloads').exists())


if __name__ == '__main__':
    unittest.main()
