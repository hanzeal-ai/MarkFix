"""Validate registry handoff without publishing real images."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class ImagePublishTest(unittest.TestCase):
    def run_script(self, failure='', commit='a' * 40):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docker = root / 'docker'
            docker.write_text("""#!/usr/bin/env python3
import os,sys,json
a=sys.argv[1:]
with open(os.environ['TEST_LOG'],'a') as log: log.write(json.dumps(a)+'\\n')
if a[0]==os.environ['FAILURE']: sys.exit(1)
if '--format' in a:
 repo=a[2].split(':')[0]
 print('untrusted@sha256:'+'b'*64 if os.environ['FAILURE']=='digest' else repo+'@sha256:'+'b'*64)
""")
            docker.chmod(0o755)
            output = root / 'output'
            log = root / 'log'
            result = subprocess.run(['bash', str(Path(__file__).with_name('publish_images.sh'))],
                env=dict(os.environ, PATH=str(root)+':'+os.environ['PATH'],
                         GITHUB_SHA=commit, GITHUB_OUTPUT=str(output), IMAGE_ARCHIVE_DIR=str(root),
                         TEST_LOG=str(log), FAILURE=failure), capture_output=True, text=True)
            return result, output.read_text() if output.exists() else '', [json.loads(x) for x in log.read_text().splitlines()] if log.exists() else []

    def test_load_push_then_export_digests(self):
        result, output, calls = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(output.splitlines()), 2)
        self.assertTrue(output.startswith('api_image=crpi-'))
        self.assertIn('dashboard_image=crpi-', output)
        self.assertEqual([x[0] for x in calls], ['load', 'image', 'push', 'image'] * 2)

    def test_failures_do_not_emit_deployable_outputs(self):
        for failure in ['load', 'push', 'digest']:
            with self.subTest(failure=failure):
                result, output, calls = self.run_script(failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, '')
                if failure == 'load': self.assertEqual(len(calls), 1)

    def test_reject_invalid_source_without_docker(self):
        result, output, calls = self.run_script(commit='../main')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])
        self.assertEqual(output, '')


if __name__ == '__main__':
    unittest.main()
